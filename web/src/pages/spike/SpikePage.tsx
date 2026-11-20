import { useEffect, useRef, useState } from 'react';
import type { Part } from 'firebase/ai';
import { loadAIConfig, type AIConfig } from '../../ai/config';
import { ROUTES, type Route } from '../../ai/routing';
import { getFirebase } from '../../firebase/client';
import { customerPhotoUrl } from './fixtures';
import { imagePartFromBlob, imagePartFromUrl, runSpike, SPIKES, type SpikeId, type SpikeRow } from './runSpikes';

type Availability = Record<'text' | 'textImage', string>;

declare global {
  interface Window {
    __fieldnoteSpike?: { rows: SpikeRow[]; availability?: Availability; config?: AIConfig };
  }
}

async function promptApiAvailability(): Promise<Availability> {
  const LM = (globalThis as { LanguageModel?: { availability(o: unknown): Promise<string> } }).LanguageModel;
  if (!LM) return { text: 'no Prompt API in this browser', textImage: 'no Prompt API in this browser' };
  const safe = (o: unknown) => LM.availability(o).catch((e: unknown) => `error: ${String(e)}`);
  return {
    text: await safe({ expectedInputs: [{ type: 'text', languages: ['en'] }] }),
    textImage: await safe({ expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }] }),
  };
}

export function SpikePage() {
  const [config, setConfig] = useState<AIConfig>();
  const [availability, setAvailability] = useState<Availability>();
  const [mode, setMode] = useState<Route | 'route'>('route');
  const [rows, setRows] = useState<SpikeRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const image = useRef<Part | null>(null);
  const [imageLabel, setImageLabel] = useState('sample: customer-photo-led.jpg');

  useEffect(() => {
    (async () => {
      try {
        const [cfg, av] = await Promise.all([loadAIConfig(getFirebase().app), promptApiAvailability()]);
        image.current = await imagePartFromUrl(customerPhotoUrl);
        setConfig(cfg);
        setAvailability(av);
        window.__fieldnoteSpike = { rows: [], availability: av, config: cfg };
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function run(ids: SpikeId[]) {
    if (!config || !image.current) return;
    setBusy('Starting…');
    const next: SpikeRow[] = [];
    for (const id of ids) {
      setBusy(`Running: ${SPIKES.find((s) => s.id === id)!.label}`);
      const row = await runSpike(id, {
        config,
        mode: mode === 'route' ? undefined : mode,
        image: image.current,
        onProgress: setBusy,
      });
      next.push(row);
      setRows((prev) => [row, ...prev]);
    }
    window.__fieldnoteSpike = { ...window.__fieldnoteSpike, rows: [...next, ...(window.__fieldnoteSpike?.rows ?? [])] };
    setBusy(null);
  }

  async function onFile(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      setError('On-device image input supports JPEG and PNG only.');
      return;
    }
    image.current = await imagePartFromBlob(file);
    setImageLabel(`uploaded: ${file.name}`);
  }

  return (
    <section className="card spike" aria-labelledby="spike-title">
      <h1 id="spike-title">Hybrid spike (P1)</h1>
      <p className="lede">
        Real Firebase AI Logic calls. Each row shows where inference actually ran, as reported by the SDK.
      </p>
      {error && <p className="error-detail" role="alert">{error}</p>}

      <h2>This browser</h2>
      <dl className="status">
        <dt>Prompt API, text</dt>
        <dd data-testid="lm-text">{availability?.text ?? '…'}</dd>
        <dt>Prompt API, text + image</dt>
        <dd data-testid="lm-image">{availability?.textImage ?? '…'}</dd>
        <dt>Remote Config</dt>
        <dd>
          {config
            ? `${config.origin} · fast=${config.cloudModelFast} · triage=${config.routes.triage} · diagnosis=${config.routes.diagnosis}`
            : '…'}
        </dd>
        <dt>Image</dt>
        <dd>
          {imageLabel}
          <label className="file-label">
            Use another photo
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </dd>
      </dl>

      <h2>Run</h2>
      <div className="spike-controls">
        <label>
          Mode{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value as Route | 'route')} disabled={!!busy}>
            <option value="route">Remote Config route (per feature)</option>
            {ROUTES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => run(SPIKES.map((s) => s.id))} disabled={!config || !!busy}>
          Run all
        </button>
        {SPIKES.map((s) => (
          <button key={s.id} type="button" className="secondary" onClick={() => run([s.id])} disabled={!config || !!busy}>
            {s.label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="lede" data-testid="spike-busy">
        {busy ?? (config ? 'Ready.' : 'Loading Remote Config…')}
      </p>

      <div className="table-wrap">
        <table data-testid="spike-results">
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Mode</th>
              <th scope="col">Ran</th>
              <th scope="col">Latency</th>
              <th scope="col">Check</th>
              <th scope="col">Output</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.id}-${rows.length - i}`}>
                <td>{r.label}</td>
                <td>{r.mode}</td>
                <td>
                  <span className={`pill ${r.source === 'ON_DEVICE' ? 'pill-ok' : r.source === 'ERROR' ? 'pill-error' : 'pill-neutral'}`}>
                    {r.source}
                  </span>
                </td>
                <td>{r.latencyMs === null ? '–' : `${r.latencyMs} ms`}</td>
                <td>
                  {r.pass ? '✅' : '❌'} {r.check}
                </td>
                <td>
                  <pre>{r.output.slice(0, 600)}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
