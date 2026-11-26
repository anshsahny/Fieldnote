import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAI } from 'firebase/ai';
import { doc, Timestamp, updateDoc } from 'firebase/firestore';
import { BookOpen, Check, Cloud, ImageUp, Lock, ScanSearch, Smartphone, Sparkles, TriangleAlert } from 'lucide-react';
import { TRIAGE_SCHEMA } from '../../ai/diagnosis';
import { makeModel, runTimed, type Source } from '../../ai/hybrid';
import { logInferenceEvent } from '../../ai/ledger';
import { browserAvailability, prewarmOnDevice, type Availability } from '../../ai/onDevice';
import { PROMPTS, renderPrompt } from '../../ai/prompts';
import type { Route } from '../../ai/routing';
import { useAIConfig } from '../../ai/useAIConfig';
import { useProfile } from '../../auth/AuthProvider';
import { useJobs, usePacks } from '../../data/hooks';
import { APP_CHECK_BLOCKED, isAppCheckFailure } from '../../firebase/appCheckErrors';
import { getDb, getFirebase } from '../../firebase/client';
import { validateFixPackJson } from '../../fixpack/validate';
import type { FixPack } from '../../fixpack/schema';
import { downscale, isHeic, toInlinePart, ACCEPTED } from '../../triage/image';
import { redactContact } from '../../triage/privacy';
import { matchTriage, packParts, parseTriage, type PackMatch, type TriageReading } from '../../triage/match';
import { SAMPLES } from '../../triage/samples';
import { Callout, Card, CodeChip, PageHeader, Segmented, SourceBadge } from '../../ui/components';
import { percent } from '../../ui/format';

interface Photo {
  blob: Blob;
  url: string;
  label: string;
  sampleId?: string;
}

type Run =
  | { state: 'idle' }
  | { state: 'running'; where: 'device' | 'cloud' }
  | { state: 'done'; reading: TriageReading; match: PackMatch; source: Source; latencyMs: number }
  | { state: 'error'; message: string };

const SESSION_CLOUD_OK = 'fn-triage-cloud-ok';

export function TriagePage() {
  const profile = useProfile();
  const config = useAIConfig();
  const [params] = useSearchParams();
  const jobs = useJobs(profile?.orgId);
  const packDocs = usePacks(profile?.orgId);
  const packs = useMemo<FixPack[]>(
    () =>
      packDocs.data.flatMap((d) => {
        const r = validateFixPackJson(d.packJson);
        return r.ok ? [r.pack] : [];
      }),
    [packDocs.data],
  );

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [message, setMessage] = useState('');
  const [jobId, setJobId] = useState<string>(params.get('job') ?? '');
  const [run, setRun] = useState<Run>({ state: 'idle' });
  const [availability, setAvailability] = useState<Availability | 'checking'>('checking');
  const [override, setOverride] = useState<'rc' | Route>('rc');
  const [askCloud, setAskCloud] = useState(false);
  const [attached, setAttached] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    void browserAvailability(true).then(setAvailability);
  }, []);
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);
  useEffect(() => {
    if (askCloud) dialog.current?.showModal();
    else dialog.current?.close();
  }, [askCloud]);

  const route: Route = override === 'rc' ? config.routes.triage : override;
  const job = jobs.data.find((j) => j.id === jobId);
  const onDeviceReady = availability === 'available';
  const willUseCloud = route === 'only_in_cloud' || route === 'prefer_in_cloud' || (!onDeviceReady && route === 'prefer_on_device');
  // Load Gemini Nano while the dispatcher picks a photo, so the first triage isn't a cold start.
  useEffect(() => (onDeviceReady && !willUseCloud ? prewarmOnDevice(true) : undefined), [onDeviceReady, willUseCloud]);
  const blocked = route === 'only_on_device' && !onDeviceReady;

  async function choose(blob: Blob, label: string, sampleId?: string) {
    setFileError(null);
    setRun({ state: 'idle' });
    setAttached(null);
    const small = await downscale(blob);
    setPhoto({ blob: small, url: URL.createObjectURL(small), label, sampleId });
  }

  async function chooseSample(id: string) {
    const s = SAMPLES.find((x) => x.id === id)!;
    const blob = await (await fetch(s.src)).blob();
    setMessage(s.message);
    if (s.jobId && jobs.data.some((j) => j.id === s.jobId)) setJobId(s.jobId);
    await choose(blob, s.label, s.id);
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    if (isHeic(file)) {
      setFileError('iPhone HEIC photos can’t be read in the browser. On the iPhone, share the photo and choose “Save as JPEG”, or take a screenshot of it.');
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setFileError('Use a JPEG, PNG or WebP photo.');
      return;
    }
    await choose(file, file.name);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void chooseFile(e.dataTransfer.files[0]);
  }

  function start() {
    if (!photo || blocked) return;
    let cloudOk = false;
    try {
      cloudOk = sessionStorage.getItem(SESSION_CLOUD_OK) === '1';
    } catch {
      /* storage blocked: ask every time */
    }
    if (willUseCloud && !cloudOk) setAskCloud(true);
    else void analyze();
  }

  async function analyze() {
    if (!photo || !profile) return;
    setAskCloud(false);
    setAttached(null);
    setRun({ state: 'running', where: willUseCloud ? 'cloud' : 'device' });
    const p = renderPrompt(PROMPTS.triage, { customer_message: redactContact(message.trim()) || 'No message.' });
    const tokens = Math.round((p.system.length + p.user.length) / 3.5) + 258; // + one image
    try {
      const model = makeModel(getAI(getFirebase().app), {
        feature: 'triage',
        config,
        mode: route,
        image: true,
        schema: TRIAGE_SCHEMA,
        systemInstruction: p.system,
      });
      const r = await runTimed(model, [p.user, await toInlinePart(photo.blob)]);
      void logInferenceEvent(profile.orgId, {
        feature: 'triage',
        source: r.source === 'UNKNOWN' ? 'NONE' : r.source,
        latencyMs: r.latencyMs,
        ok: true,
        promptTokensEst: tokens,
        model: r.source === 'IN_CLOUD' ? config.cloudModelFast : 'gemini-nano',
        mode: route,
      });
      const parsed = parseTriage(r.text);
      if (!parsed.ok) {
        setRun({ state: 'error', message: `${parsed.error} Try again, or pick another photo.` });
        return;
      }
      setRun({
        state: 'done',
        reading: parsed.reading,
        match: matchTriage(parsed.reading, packs, job?.equipment?.brand),
        source: r.source,
        latencyMs: r.latencyMs,
      });
    } catch (e) {
      void logInferenceEvent(profile.orgId, { feature: 'triage', source: 'NONE', latencyMs: 0, ok: false, promptTokensEst: tokens, mode: route });
      const msg = e instanceof Error ? e.message : String(e);
      setRun({
        state: 'error',
        message: isAppCheckFailure(msg)
          ? APP_CHECK_BLOCKED
          : /quota|429/i.test(msg)
          ? 'The cloud model is busy right now. Try again in a minute.'
          : `The model couldn't analyze this photo (${msg.slice(0, 160)}).`,
      });
    }
  }

  async function attach() {
    if (run.state !== 'done' || !profile || !jobId) return;
    const { reading, match, source, latencyMs } = run;
    const triage: Record<string, unknown> = {
      likelyFault: match.kind === 'matched' ? match.fault.meaning : reading.likelyFault,
      source,
      latencyMs,
      confidence: reading.confidence,
      // A matched code takes its parts from the pack, not from the model's guess.
      partsToBring: (match.kind === 'matched' ? packParts(match.pack, match.fault) : reading.partsToBring).slice(0, 10),
      photoStayedOnDevice: source === 'ON_DEVICE',
      attachedAt: Timestamp.now(),
      ...(reading.brand && { brand: reading.brand }),
      ...(reading.model && { model: reading.model }),
      ...(reading.errorCode && { errorCode: reading.errorCode }),
      ...('pack' in match && { packId: match.pack.packId }),
      ...(match.kind === 'matched' && { matchedCode: match.fault.code }),
    };
    try {
      await updateDoc(doc(getDb(), 'orgs', profile.orgId, 'jobs', jobId), { triage, updatedAt: Timestamp.now() });
      setAttached(jobId);
    } catch {
      setRun({ state: 'error', message: "Couldn't attach the triage to that job. Your account may not be allowed to edit it." });
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Photo pre-triage"
        title="Know the fault before the truck rolls"
        description="Customers send a photo of the furnace display. Fieldnote reads it, checks the code against your published fix packs, and lists the parts to bring."
      />

      <RouteBanner route={route} availability={availability} />

      <div className="grid grid-main">
        <div className="stack">
          <Card title="1. Customer photo" icon={ImageUp} labelledBy="photo-title">
            <div className="stack">
              <div>
                <p className="muted" style={{ marginBottom: 10, fontSize: 'var(--t-md)' }}>
                  Try a sample (synthetic photos that match the demo jobs):
                </p>
                <div className="thumbs" role="group" aria-label="Sample photos">
                  {SAMPLES.map((s) => (
                    <button key={s.id} type="button" className="thumb" aria-pressed={photo?.sampleId === s.id} onClick={() => void chooseSample(s.id)}>
                      <img src={s.src} alt="" loading="lazy" />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <label
                className="dropzone"
                data-over={over}
                onDragOver={(e) => (e.preventDefault(), setOver(true))}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                <ImageUp size={28} aria-hidden="true" />
                <span>
                  <strong>Drop a photo here</strong> or <span style={{ color: 'var(--brand-text)', fontWeight: 600 }}>choose a file</span>
                </span>
                <span className="subtle" style={{ fontSize: 'var(--t-sm)' }}>
                  JPEG, PNG or WebP. Resized in your browser before anything else happens.
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED.join(',')}
                  className="sr-only"
                  onChange={(e) => void chooseFile(e.target.files?.[0])}
                />
              </label>
              {fileError && <Callout tone="caution">{fileError}</Callout>}
            </div>
          </Card>

          <Card title="2. Details" labelledBy="details-title">
            <div className="form" style={{ marginTop: 0 }}>
              <label>
                Customer's message
                <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What did the customer say?" />
              </label>
              <label>
                Job
                <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">Not linked to a job</option>
                  {jobs.data.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.customer.name} · {j.equipment?.brand && j.equipment.brand !== 'Unknown' ? j.equipment.brand : 'equipment unknown'}
                    </option>
                  ))}
                </select>
              </label>
              {import.meta.env.DEV && (
                <div className="field">
                  Route (dev only)
                  <Segmented
                    label="Route override"
                    value={override}
                    onChange={setOverride}
                    options={[
                      { value: 'rc', label: 'Remote Config' },
                      { value: 'only_on_device', label: 'On-device' },
                      { value: 'only_in_cloud', label: 'Cloud' },
                    ]}
                  />
                </div>
              )}
              <button type="button" className="lg" onClick={start} disabled={!photo || run.state === 'running' || blocked} data-testid="run-triage">
                {run.state === 'running' ? <span className="spinner" aria-hidden="true" /> : <ScanSearch size={18} aria-hidden="true" />}
                {run.state === 'running'
                  ? run.where === 'device'
                    ? 'Reading the photo on this computer…'
                    : 'Asking Gemini in the cloud…'
                  : 'Analyze photo'}
              </button>
              {blocked && <p className="subtle">This route is on-device only and this browser can't run the model.</p>}
            </div>
          </Card>
        </div>

        <ResultPanel
          photo={photo}
          run={run}
          jobName={job?.customer.name}
          canAttach={!!jobId && (profile?.role === 'dispatcher' || profile?.role === 'guest')}
          attached={attached === jobId}
          onAttach={() => void attach()}
        />
      </div>

      <dialog ref={dialog} className="modal" aria-labelledby="cloud-title" onClose={() => setAskCloud(false)}>
        <div className="stack-sm">
          <span className="stat-icon tone-cloud">
            <Cloud size={16} aria-hidden="true" />
          </span>
          <h2 id="cloud-title">Send this photo to cloud AI?</h2>
          <p className="muted">
            {onDeviceReady
              ? 'The current route sends triage to Gemini in the cloud.'
              : "This browser can't run the on-device model, so the photo would go to Gemini in the cloud."}{' '}
            It's sent through Firebase AI Logic with App Check and isn't stored by Fieldnote.
          </p>
          <label className="row" style={{ fontWeight: 500, fontSize: 'var(--t-md)' }}>
            <input
              type="checkbox"
              style={{ minHeight: 'auto' }}
              onChange={(e) => {
                try {
                  if (e.target.checked) sessionStorage.setItem(SESSION_CLOUD_OK, '1');
                  else sessionStorage.removeItem(SESSION_CLOUD_OK);
                } catch {
                  /* ignore */
                }
              }}
            />
            Don't ask again in this tab
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="secondary" onClick={() => setAskCloud(false)}>
              Cancel
            </button>
            <button type="button" onClick={() => void analyze()} data-testid="confirm-cloud">
              <Cloud size={16} aria-hidden="true" />
              Send to cloud
            </button>
          </div>
          <p className="subtle" style={{ fontSize: 'var(--t-sm)' }}>
            To keep photos on this computer, <Link to="/status">turn on Chrome's built-in AI</Link>.
          </p>
        </div>
      </dialog>
    </div>
  );
}

function RouteBanner({ route, availability }: { route: Route; availability: Availability | 'checking' }) {
  if (availability === 'checking') return null;
  const ready = availability === 'available';
  if (ready && (route === 'prefer_on_device' || route === 'only_on_device')) {
    return (
      <Callout tone="ondevice" icon={Lock} title="Photos stay in this browser">
        Gemini Nano runs on this computer, so customer photos are analyzed without leaving it. Free and private.
      </Callout>
    );
  }
  if (route === 'only_in_cloud' || route === 'prefer_in_cloud') {
    return (
      <Callout tone="cloud" title="Triage is routed to the cloud">
        Remote Config sends triage to Gemini in the cloud right now. You'll be asked before a photo is sent.
      </Callout>
    );
  }
  return (
    <Callout tone="cloud" title="This browser will use cloud AI">
      Chrome's on-device model isn't available here, so triage falls back to Gemini in the cloud after you confirm.{' '}
      <Link to="/status">Turn on on-device AI</Link>
    </Callout>
  );
}

function ResultPanel({
  photo,
  run,
  jobName,
  canAttach,
  attached,
  onAttach,
}: {
  photo: Photo | null;
  run: Run;
  jobName?: string;
  canAttach: boolean;
  attached: boolean;
  onAttach: () => void;
}) {
  return (
    <Card title="Result" icon={Sparkles} labelledBy="result-title" className="triage-result">
      <div className="stack" aria-live="polite">
        {photo ? (
          <img src={photo.url} alt={`Customer photo: ${photo.label}`} className="photo-preview" />
        ) : (
          <div className="empty" style={{ padding: '28px 12px' }}>
            <ScanSearch size={32} aria-hidden="true" />
            <div className="empty-title">Pick a photo to start</div>
            <div className="muted">The result shows what the model read, and what your fix pack says about it.</div>
          </div>
        )}

        {run.state === 'running' && (
          <div className="stack-sm" aria-busy="true">
            <span className="skeleton" style={{ height: 22, width: '70%' }} />
            <span className="skeleton" style={{ height: 16, width: '90%' }} />
            <span className="skeleton" style={{ height: 16, width: '55%' }} />
          </div>
        )}

        {run.state === 'error' && <Callout tone="danger">{run.message}</Callout>}

        {run.state === 'done' && (
          <>
            <div className="row">
              <SourceBadge source={run.source} latencyMs={run.latencyMs} where={run.source === 'ON_DEVICE' ? 'this browser' : undefined} />
              {run.source === 'ON_DEVICE' && (
                <span className="subtle row" style={{ fontSize: 'var(--t-sm)', gap: 4 }}>
                  <Lock size={13} aria-hidden="true" />
                  Photo never left this computer
                </span>
              )}
            </div>

            <dl className="kv">
              <dt>Brand</dt>
              <dd>{run.reading.brand ?? 'Not visible'}</dd>
              <dt>Model</dt>
              <dd className="mono">{run.reading.model ?? 'Not visible'}</dd>
              <dt>Code read</dt>
              <dd>{run.reading.errorCode ? <CodeChip code={run.reading.errorCode} /> : 'None visible'}</dd>
              {/* A matched code's meaning comes from the fix pack, so the model's free-text guess (which
                  can disagree) is shown only when no pack matches. */}
              {run.match.kind === 'matched' ? (
                <>
                  <dt>Fault</dt>
                  <dd data-testid="triage-fault">{run.match.fault.meaning}</dd>
                </>
              ) : (
                <>
                  <dt>Model's guess</dt>
                  <dd data-testid="triage-fault">{run.reading.likelyFault}</dd>
                </>
              )}
              <dt>{run.match.kind === 'matched' ? 'Read confidence' : 'Confidence'}</dt>
              <dd>
                <span className="row" style={{ gap: 10 }}>
                  <span className="meter" style={{ width: 120 }} aria-hidden="true">
                    <span style={{ width: `${run.reading.confidence * 100}%`, background: 'var(--chart-cloud)' }} />
                  </span>
                  {percent(run.reading.confidence, 1)}
                </span>
              </dd>
            </dl>

            <PackMatchPanel match={run.match} parts={run.reading.partsToBring} />

            <div className="row">
              {attached ? (
                <span className="badge badge-ondevice">
                  <Check size={12} aria-hidden="true" />
                  Attached to {jobName}
                </span>
              ) : (
                <button type="button" onClick={onAttach} disabled={!canAttach} title={canAttach ? undefined : 'Pick a job in step 2'}>
                  Attach to {jobName ?? 'job'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function PackMatchPanel({ match, parts }: { match: PackMatch; parts: string[] }) {
  if (match.kind === 'matched') {
    const f = match.fault;
    return (
      <div className="inset stack-sm">
        <div className="row">
          <BookOpen size={16} aria-hidden="true" className="subtle" />
          <span className="subtle" style={{ fontSize: 'var(--t-sm)' }}>
            Verified against the {match.pack.brand} fix pack v{match.pack.version} (facts from the manual, not the model)
          </span>
        </div>
        <div className="row">
          <CodeChip code={f.code} large />
          <strong>{f.meaning}</strong>
        </div>
        <div>
          <div className="subtle" style={{ fontSize: 'var(--t-xs)', fontWeight: 650, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Likely causes
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            {f.likelyCauses.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        {(() => {
          const fromPack = packParts(match.pack, f);
          return fromPack.length > 0 ? (
            <p>
              <strong>Parts the repair may need:</strong> {fromPack.join(', ')}
            </p>
          ) : null;
        })()}
        <p className="subtle" style={{ fontSize: 'var(--t-sm)' }}>
          Manual pages {f.pages}. The technician's phone already has this pack offline.
        </p>
      </div>
    );
  }
  const tone = match.kind === 'no_pack' ? 'caution' : 'info';
  const text =
    match.kind === 'close'
      ? `The code isn't an exact match in the ${match.pack.brand} pack. Closest: ${match.faults.map((f) => f.code).join(', ')}. Ask the customer to confirm the display.`
      : match.kind === 'code_not_in_pack'
        ? `The ${match.pack.brand} pack doesn't cover that code. The technician will diagnose on site.`
        : match.kind === 'no_code'
          ? `Equipment matches the ${match.pack.brand} pack, but no code is visible. Ask the customer for a photo of the display.`
          : "No published fix pack covers this equipment yet. Add one from the manual in Fix packs.";
  return (
    <Callout tone={tone} icon={match.kind === 'no_pack' ? TriangleAlert : Smartphone}>
      {text}
      {parts.length > 0 && <div style={{ marginTop: 6 }}>The model suggests bringing: {parts.join(', ')} (not checked against a pack).</div>}
    </Callout>
  );
}
