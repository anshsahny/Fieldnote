import { useEffect, useRef, useState } from 'react';
import type { Part } from 'firebase/ai';
import type { AIConfig } from '../../ai/config';
import { makeCompileGenerate } from '../../ai/compileModel';
import { logInferenceEvent } from '../../ai/ledger';
import { assemblePack, type CodeOutput, type IndexOutput } from '../../fixpack/compiler/assemble';
import { compileCode, compileIndex, type CallRecord } from '../../fixpack/compiler/compile';
import { bytesToBase64, formatPages, parsePageRange, pdfPageCount, slicePdf } from '../../fixpack/compiler/pdf';
import { serializeFixPack } from '../../fixpack/validate';
import { MANUAL_SOURCES } from './sources';

type CodeState = { state: 'queued' | 'running' | 'ok' | 'failed'; latencyMs?: number; error?: string };

const DEFAULT_SELECTION = 10;

export function CompilePanel({ config, orgId, onCompiled }: { config: AIConfig; orgId: string; onCompiled: (json: string) => void }) {
  const [sourceId, setSourceId] = useState(MANUAL_SOURCES[0]?.id ?? 'upload');
  const source = MANUAL_SOURCES.find((s) => s.id === sourceId);
  const [title, setTitle] = useState(source?.title ?? '');
  const [url, setUrl] = useState(source?.url ?? '');
  const [pages, setPages] = useState(source?.diagnosticPages ?? '');
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const [upload, setUpload] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [index, setIndex] = useState<IndexOutput | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [codeStates, setCodeStates] = useState<Record<string, CodeState>>({});
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pdfPart = useRef<{ part: Part; pageList: string } | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void import('./localManuals').then((m) => setLocalUrls(m.LOCAL_MANUAL_URLS));
  }, []);

  function chooseSource(id: string) {
    setSourceId(id);
    const s = MANUAL_SOURCES.find((x) => x.id === id);
    setTitle(s?.title ?? '');
    setUrl(s?.url ?? '');
    setPages(s?.diagnosticPages ?? '');
    reset();
  }

  function reset() {
    setIndex(null);
    setSelected(new Set());
    setCodeStates({});
    setPageCount(null);
    pdfPart.current = null;
    setError(null);
  }

  const localUrl = source?.localFile ? localUrls[source.localFile] : undefined;
  const generate = makeCompileGenerate(config);
  const hooks = {
    onProgress: setBusy,
    onCall: async (c: CallRecord) => {
      setCalls((prev) => [...prev, c]);
      await logInferenceEvent(orgId, {
        feature: 'compile',
        source: 'IN_CLOUD',
        latencyMs: c.latencyMs,
        ok: c.ok,
        promptTokensEst: c.promptTokens,
        model: c.model,
        mode: config.routes.compile,
      });
    },
  };

  async function loadBytes(): Promise<Uint8Array> {
    if (upload) return new Uint8Array(await upload.arrayBuffer());
    if (localUrl) return new Uint8Array(await (await fetch(localUrl)).arrayBuffer());
    throw new Error('Choose a PDF to upload.');
  }

  async function readIndex() {
    setError(null);
    setBusy('Loading the manual…');
    try {
      const bytes = await loadBytes();
      const count = await pdfPageCount(bytes);
      setPageCount(count);
      const pageNumbers = parsePageRange(pages, count);
      setBusy(`Cutting pages ${formatPages(pageNumbers)} out of ${count}…`);
      const sliced = await slicePdf(bytes, pageNumbers);
      const pageList = formatPages(pageNumbers);
      pdfPart.current = {
        pageList,
        part: { type: 'inlineData', inlineData: { mimeType: 'application/pdf', data: bytesToBase64(sliced) } } as Part,
      };
      const idx = await compileIndex(generate, pdfPart.current.part, { title, pageList }, hooks);
      setIndex(idx);
      setSelected(new Set(idx.faultCodes.slice(0, DEFAULT_SELECTION).map((f) => f.code)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function compileSelected() {
    if (!index || !pdfPart.current) return;
    setError(null);
    const codes = index.faultCodes.filter((f) => selected.has(f.code)).map((f) => f.code);
    setCodeStates(Object.fromEntries(codes.map((c) => [c, { state: 'queued' }])));
    const outputs: Record<string, CodeOutput> = {};
    for (const code of codes) {
      setCodeStates((s) => ({ ...s, [code]: { state: 'running' } }));
      const started = performance.now();
      try {
        outputs[code] = await compileCode(generate, pdfPart.current.part, index, code, { title, url, pageList: pdfPart.current.pageList }, hooks);
        setCodeStates((s) => ({ ...s, [code]: { state: 'ok', latencyMs: Math.round(performance.now() - started) } }));
      } catch (e) {
        setCodeStates((s) => ({ ...s, [code]: { state: 'failed', error: e instanceof Error ? e.message : String(e) } }));
      }
    }
    setBusy(null);
    if (Object.keys(outputs).length === 0) {
      setError('No codes compiled successfully.');
      return;
    }
    const pack = assemblePack({ index, codes: outputs, source: { title, url, pages: pdfPart.current.pageList } });
    onCompiled(serializeFixPack(pack));
  }

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const totalMs = calls.reduce((a, c) => a + c.latencyMs, 0);
  const totalTokens = calls.reduce((a, c) => a + (c.promptTokens ?? 0), 0);

  return (
    <section className="card" aria-labelledby="compile-title">
      <h2 id="compile-title">Compile a manual</h2>
      <p className="lede">
        The cloud model ({config.cloudModelCompile}, route {config.routes.compile}) reads only the pages you choose. It
        extracts facts and paraphrases them, and every code is checked by the validator before you review it.
      </p>
      <div className="form grid2">
        <label>
          Manual
          <select value={sourceId} onChange={(e) => chooseSource(e.target.value)} disabled={!!busy}>
            {MANUAL_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.brand}: {s.family}
              </option>
            ))}
            <option value="upload">Another manual (upload a PDF)</option>
          </select>
        </label>
        <label>
          PDF file{localUrl && !upload ? ' (local copy found; upload to override)' : ''}
          <input type="file" accept="application/pdf" onChange={(e) => { setUpload(e.target.files?.[0] ?? null); reset(); }} disabled={!!busy} />
        </label>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!!busy} />
        </label>
        <label>
          Source URL
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!!busy} />
        </label>
        <label>
          Pages to read{pageCount ? ` (of ${pageCount})` : ''}
          <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="e.g. 42-49" disabled={!!busy} />
        </label>
        <div className="form-actions">
          <button type="button" onClick={readIndex} disabled={!!busy || (!upload && !localUrl) || !title || !url || !pages}>
            1. Read fault code index
          </button>
        </div>
      </div>

      {index && (
        <>
          <h3>
            {index.brand} · {index.family} · {index.faultCodes.length} codes found
          </h3>
          <p className="lede">
            Display: {index.displayType} · Models: <code>{index.modelPatterns.join('  ')}</code>
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Compile</th>
                  <th scope="col">Code</th>
                  <th scope="col">Shown as</th>
                  <th scope="col">Meaning</th>
                  <th scope="col">Pages</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {index.faultCodes.map((f) => {
                  const st = codeStates[f.code];
                  return (
                    <tr key={f.code}>
                      <td>
                        <input type="checkbox" aria-label={`Compile code ${f.code}`} checked={selected.has(f.code)} onChange={() => toggle(f.code)} disabled={!!busy} />
                      </td>
                      <td>
                        <strong>{f.code}</strong>
                      </td>
                      <td>{f.display}</td>
                      <td>{f.meaning}</td>
                      <td>{f.pages}</td>
                      <td>
                        {st?.state === 'ok' && <span className="pill pill-ok">OK · {((st.latencyMs ?? 0) / 1000).toFixed(1)} s</span>}
                        {st?.state === 'running' && <span className="pill pill-neutral">Running…</span>}
                        {st?.state === 'queued' && <span className="pill pill-neutral">Queued</span>}
                        {st?.state === 'failed' && (
                          <span className="pill pill-error" title={st.error}>
                            Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" onClick={compileSelected} disabled={!!busy || selected.size === 0}>
              2. Compile {selected.size} selected code{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}

      <p aria-live="polite" className="lede" data-testid="compile-status">
        {busy ?? (calls.length ? `${calls.length} cloud calls · ${(totalMs / 1000).toFixed(1)} s · ~${totalTokens.toLocaleString()} prompt tokens` : '')}
      </p>
      {error && (
        <p className="error-detail" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
