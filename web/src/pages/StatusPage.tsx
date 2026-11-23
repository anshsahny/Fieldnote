import { useEffect, useState } from 'react';
import { Cpu, FlaskConical, Image, ShieldCheck, SlidersHorizontal, Type } from 'lucide-react';
import { getAI } from 'firebase/ai';
import { makeModel, runTimed, type RunResult } from '../ai/hybrid';
import { logInferenceEvent } from '../ai/ledger';
import { AVAILABILITY_TEXT, browserAvailability, chromeVersion, type Availability } from '../ai/onDevice';
import { FEATURES } from '../ai/routing';
import { useAIConfig } from '../ai/useAIConfig';
import { useProfile } from '../auth/AuthProvider';
import { APP_CHECK_BLOCKED, isAppCheckFailure } from '../firebase/appCheckErrors';
import { checkAppCheck, getFirebase } from '../firebase/client';
import { Callout, Card, PageHeader, SourceBadge } from '../ui/components';
import { featureLabel } from '../ledger/aggregate';

type Check<T> = { kind: 'checking' } | { kind: 'done'; value: T };
type AppCheckState = { kind: 'idle' } | Check<{ ok: boolean; detail: string }>;

const MODE_LABEL: Record<string, string> = {
  debug: 'debug provider (localhost)',
  'recaptcha-enterprise': 'reCAPTCHA Enterprise',
};

function AvailabilityBadge({ value }: { value: Availability }) {
  const cls = value === 'available' ? 'badge-ondevice' : value === 'downloadable' || value === 'downloading' ? 'badge-caution' : '';
  return <span className={`badge ${cls}`}>{AVAILABILITY_TEXT[value]}</span>;
}

export function StatusPage() {
  const profile = useProfile();
  const config = useAIConfig();
  const [text, setText] = useState<Check<Availability>>({ kind: 'checking' });
  const [image, setImage] = useState<Check<Availability>>({ kind: 'checking' });
  // Not requested on page load: a token asked for before any interaction scores low with
  // reCAPTCHA, and a rejection pauses cloud AI in this browser for a day.
  const [appCheck, setAppCheck] = useState<AppCheckState>({ kind: 'idle' });
  const [test, setTest] = useState<{ state: 'idle' | 'running' } | { state: 'done'; result: RunResult } | { state: 'error'; message: string }>({
    state: 'idle',
  });
  const version = chromeVersion();

  useEffect(() => {
    void browserAvailability(false).then((v) => setText({ kind: 'done', value: v }));
    void browserAvailability(true).then((v) => setImage({ kind: 'done', value: v }));
  }, []);

  async function verifyAppCheck() {
    setAppCheck({ kind: 'checking' });
    const fb = getFirebase();
    const r = await checkAppCheck(fb.appCheck);
    setAppCheck({
      kind: 'done',
      value: r.ok ? { ok: true, detail: MODE_LABEL[fb.appCheckMode] ?? fb.appCheckMode } : { ok: false, detail: r.error },
    });
  }

  async function runTest() {
    setTest({ state: 'running' });
    try {
      const ai = getAI(getFirebase().app);
      const model = makeModel(ai, {
        feature: 'job_summary',
        config,
        mode: 'only_on_device',
        systemInstruction: 'You are a connectivity check. Reply with one short friendly sentence.',
      });
      const result = await runTimed(model, 'Confirm you are running on this device.');
      setTest({ state: 'done', result });
      if (profile) {
        void logInferenceEvent(profile.orgId, {
          feature: 'status_check',
          source: result.source === 'UNKNOWN' ? 'NONE' : result.source,
          latencyMs: result.latencyMs,
          ok: true,
          mode: 'only_on_device',
        });
      }
    } catch (e) {
      setTest({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  const onDeviceReady = text.kind === 'done' && text.value === 'available';

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Hybrid status"
        title="Can this browser run AI on-device?"
        description="Fieldnote prefers on-device models: Gemini Nano in Chrome, Apple's Foundation Model on iPhone. When a device can't, the same features run on Gemini in the cloud. Nothing breaks either way."
      />

      <div className="grid grid-2">
        <Card title="This browser" icon={Cpu} labelledBy="browser-title">
          <dl className="kv">
            <dt>Chrome</dt>
            <dd>{version ? `Version ${version}` : 'Not Chrome'}</dd>
            <dt>
              <span className="row" style={{ gap: 6 }}>
                <Type size={14} aria-hidden="true" />
                Text
              </span>
            </dt>
            <dd>{text.kind === 'checking' ? 'Checking…' : <AvailabilityBadge value={text.value} />}</dd>
            <dt>
              <span className="row" style={{ gap: 6 }}>
                <Image size={14} aria-hidden="true" />
                Text + image
              </span>
            </dt>
            <dd>{image.kind === 'checking' ? 'Checking…' : <AvailabilityBadge value={image.value} />}</dd>
          </dl>
          <div className="stack-sm" style={{ marginTop: 18 }}>
            <button type="button" className="secondary" onClick={() => void runTest()} disabled={test.state === 'running' || !onDeviceReady}>
              {test.state === 'running' ? <span className="spinner" aria-hidden="true" /> : <FlaskConical size={16} aria-hidden="true" />}
              Test the on-device model
            </button>
            <div aria-live="polite">
              {test.state === 'done' && (
                <div className="inset stack-sm">
                  <SourceBadge source={test.result.source} latencyMs={test.result.latencyMs} where="this browser" />
                  <span>{test.result.text}</span>
                </div>
              )}
              {test.state === 'error' && <Callout tone="danger">{test.message}</Callout>}
              {!onDeviceReady && text.kind === 'done' && (
                <p className="subtle" style={{ fontSize: 'var(--t-sm)' }}>
                  The test needs the on-device model. Everything else in Fieldnote works with the cloud.
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card title="Turn on Chrome's built-in AI" icon={SlidersHorizontal} labelledBy="enable-title">
          <ol className="stack-sm" style={{ margin: 0, paddingLeft: 20 }}>
            <li>Use desktop Chrome 148 or newer on Windows, macOS or Linux. Chrome lists the disk and hardware it needs on its on-device internals page.</li>
            <li>
              Open <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code>, set it to <strong>Enabled</strong>, and
              relaunch Chrome.
            </li>
            <li>
              Open <code>chrome://on-device-internals</code> and check the model status. The first use downloads Gemini Nano; this page
              shows "Downloading" until it's ready.
            </li>
            <li>Come back here. Text + image should say "Ready on this device", and photo triage will run without sending the photo anywhere.</li>
          </ol>
          <p className="subtle" style={{ marginTop: 12, fontSize: 'var(--t-sm)' }}>
            Without these steps, photo triage and summaries use Gemini in the cloud, labeled with a blue Cloud badge.
          </p>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Security" icon={ShieldCheck} labelledBy="security-title">
          <dl className="kv">
            <dt>Firebase project</dt>
            <dd data-testid="project-id">{getFirebase().projectId}</dd>
            <dt>App Check</dt>
            <dd data-testid="appcheck-status">
              {appCheck.kind === 'idle' ? (
                <span className="row">
                  <span className="muted">Checked on the first AI call</span>
                  <button type="button" className="secondary" style={{ minHeight: 30, padding: '4px 10px' }} onClick={() => void verifyAppCheck()}>
                    Check now
                  </button>
                </span>
              ) : appCheck.kind === 'checking' ? (
                <span className="badge">Checking…</span>
              ) : appCheck.value.ok ? (
                <span className="badge badge-ondevice">Token acquired · {appCheck.value.detail}</span>
              ) : (
                <span className="row">
                  <span className="badge badge-danger">Not ready</span>
                  <span className="error-detail">{isAppCheckFailure(appCheck.value.detail) ? APP_CHECK_BLOCKED : appCheck.value.detail}</span>
                </span>
              )}
            </dd>
            <dt>Cloud model</dt>
            <dd className="mono">{config.cloudModelFast}</dd>
            <dt>Remote Config</dt>
            <dd>{config.origin === 'remote' ? 'Live values' : 'Built-in defaults'}</dd>
          </dl>
        </Card>

        <Card flush title="Routes from Remote Config" labelledBy="routes-title" hint="Change in the Firebase console, no release">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Route</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.filter((f) => f !== 'ledger_insights').map((f) => (
                  <tr key={f}>
                    <td>{featureLabel(f)}</td>
                    <td className="mono" style={{ fontSize: 'var(--t-sm)' }}>
                      {config.routes[f]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
