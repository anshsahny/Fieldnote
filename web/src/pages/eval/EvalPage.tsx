import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FlaskConical, Play } from 'lucide-react';
import { loadAIConfig, type AIConfig } from '../../ai/config';
import { diagnosisSchema } from '../../ai/diagnosis';
import { getAIInstance } from '../../ai/firebase';
import { makeModel, runTimed } from '../../ai/hybrid';
import { browserAvailability, prewarmOnDevice, type Availability } from '../../ai/onDevice';
import { PROMPTS } from '../../ai/prompts';
import { paced, runScenarios, summarize, type EvalRun, type Interpret, type Scenario, type TurnResult } from '../../eval/runner';
import { validateFixPackJson } from '../../fixpack/validate';
import type { FixPack } from '../../fixpack/schema';
import { getFirebase } from '../../firebase/client';
import { Callout, Card, PageHeader, Segmented } from '../../ui/components';
import { seconds } from '../../ui/format';
import scenarioFile from '../../../../eval/scenarios/p6-scenarios.json';

/**
 * Dev-only P6 eval page (/eval): runs the 24 scenarios through Chrome's on-device model or the
 * cloud model with the same rules as the iPhone, then offers the run as JSON for eval/results/.
 * ?route=only_in_cloud&auto=1 starts a run on load (used by e2e/eval.spec.ts).
 */

type EvalRoute = 'only_on_device' | 'only_in_cloud';

declare global {
  interface Window {
    __fieldnoteEval?: { done: boolean; run?: EvalRun; error?: string };
  }
}

const rawPacks = import.meta.glob('../../../../content/fixpacks/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function loadPacks(): Map<string, FixPack> {
  const packs = new Map<string, FixPack>();
  for (const text of Object.values(rawPacks)) {
    const r = validateFixPackJson(text);
    if (r.ok) packs.set(r.pack.packId, r.pack);
  }
  return packs;
}

function chromeLabel(): string {
  const m = navigator.userAgent.match(/Chrome\/(\d+)/);
  return m ? `Chrome ${m[1]}` : navigator.userAgent.slice(0, 40);
}

export function EvalPage() {
  const params = new URLSearchParams(window.location.search);
  const [route, setRoute] = useState<EvalRoute>(params.get('route') === 'only_in_cloud' ? 'only_in_cloud' : 'only_on_device');
  const [config, setConfig] = useState<AIConfig>();
  const [availability, setAvailability] = useState<Availability>();
  const [turns, setTurns] = useState<TurnResult[]>([]);
  const [run, setRun] = useState<EvalRun>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const started = useRef(false);
  const scenarios = (scenarioFile as { scenarios: Scenario[] }).scenarios;
  const total = scenarios.reduce((a, s) => a + s.turns.length, 0);
  const packs = useMemo(loadPacks, []);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, av] = await Promise.all([loadAIConfig(getFirebase().app), browserAvailability(false)]);
        setConfig(cfg);
        setAvailability(av);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        window.__fieldnoteEval = { done: true, error: String(e) };
      }
    })();
  }, []);

  async function start(which: EvalRoute, cfg: AIConfig) {
    setBusy(true);
    setTurns([]);
    setRun(undefined);
    setError(undefined);
    window.__fieldnoteEval = { done: false };
    const ai = getAIInstance();
    const call: Interpret = async (prompt) => {
      const model = makeModel(ai, {
        feature: 'diagnosis',
        config: cfg,
        mode: which,
        systemInstruction: prompt.system,
        schema: diagnosisSchema(prompt.allowed),
      });
      return runTimed(model, prompt.user);
    };
    const interpret = which === 'only_in_cloud' ? paced(call) : call;
    const startedAt = new Date().toISOString();
    try {
      const results = await runScenarios(scenarios, packs, interpret, cfg.confidenceThreshold, (r) => setTurns((t) => [...t, r]));
      const done: EvalRun = {
        platform: 'web',
        route: which,
        device: chromeLabel(),
        startedAt,
        promptVersion: PROMPTS.diagnosis.meta.version,
        threshold: cfg.confidenceThreshold,
        cloudModel: cfg.cloudModelFast,
        turns: results,
      };
      setRun(done);
      window.__fieldnoteEval = { done: true, run: done };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      window.__fieldnoteEval = { done: true, error: String(e) };
    } finally {
      setBusy(false);
    }
  }

  // Like the triage page: load Gemini Nano before the first on-device turn.
  useEffect(() => (route === 'only_on_device' && availability === 'available' ? prewarmOnDevice(false) : undefined), [route, availability]);

  useEffect(() => {
    if (config && params.get('auto') === '1' && !started.current) {
      started.current = true;
      void start(route, config);
    }
  }, [config]);

  function download() {
    if (!run) return;
    const blob = new Blob([JSON.stringify(run, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `web-${run.route}-${run.startedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const s = turns.length ? summarize(turns) : undefined;
  const onDeviceBlocked = route === 'only_on_device' && availability !== 'available';

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Developer"
        title="Diagnosis eval"
        description="The 24 scenarios in eval/scenarios/p6-scenarios.json, scored with the same safety, hedge and clarification rules as the iPhone app."
      />
      {error && <Callout tone="danger" title="Run stopped">{error}</Callout>}
      <Card
        title="Run"
        icon={FlaskConical}
        actions={
          <Segmented
            label="Route"
            value={route}
            onChange={setRoute}
            options={[
              { value: 'only_on_device', label: 'On this device' },
              { value: 'only_in_cloud', label: 'Cloud' },
            ]}
          />
        }
      >
        <div className="stack-sm">
          <p className="muted">
            {chromeLabel()} · on-device model: {availability ?? 'checking…'} · threshold {config?.confidenceThreshold ?? '…'} · prompt v
            {PROMPTS.diagnosis.meta.version}
          </p>
          {onDeviceBlocked && availability && (
            <Callout tone="caution" title="Gemini Nano isn't ready in this browser">
              Use Chrome with the on-device model downloaded (see the Status page), or switch to Cloud.
            </Callout>
          )}
          <div className="row">
            <button className="btn" type="button" disabled={!config || busy || onDeviceBlocked} onClick={() => config && start(route, config)}>
              <Play size={16} aria-hidden="true" />
              {busy ? `Running turn ${turns.length + 1} of ${total}…` : `Run ${total} turns`}
            </button>
            <button className="btn btn-secondary" type="button" disabled={!run} onClick={download}>
              <Download size={16} aria-hidden="true" />
              Download JSON
            </button>
          </div>
        </div>
      </Card>
      {s && (
        <Card title="Results" hint={`${turns.length} of ${total} turns`}>
          <p>
            Choice {s.choice.correct}/{s.choice.total} · asked on hedged notes {s.clarify.correct}/{s.clarify.total} · safety{' '}
            {s.safety.correct}/{s.safety.total} (model calls {s.safety.modelCalls}) · scenarios {s.scenarios.correct}/{s.scenarios.total} · median{' '}
            {seconds(s.medianLatencyMs)} · errors {s.errors}
          </p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Turn results">
            <table>
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col">Turn</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Source</th>
                  <th scope="col">Time</th>
                </tr>
              </thead>
              <tbody>
                {turns.map((t) => (
                  <tr key={`${t.scenario}-${t.turn}`}>
                    <td>{t.scenario}</td>
                    <td>{t.turn}</td>
                    <td>{t.expect}</td>
                    <td>
                      {t.ok ? '✓ ' : '✗ '}
                      {t.outcome}
                      {t.error ? ` (${t.error.slice(0, 60)})` : ''}
                    </td>
                    <td>{t.source ?? (t.modelCalled ? '' : 'rule')}</td>
                    <td>{t.latencyMs !== undefined ? seconds(t.latencyMs) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
