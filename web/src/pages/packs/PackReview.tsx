import { useEffect, useMemo, useState } from 'react';
import type { FixPack, Step } from '../../fixpack/schema';
import { MAX_PACK_BYTES } from '../../fixpack/schema';
import { validateFixPackJson, type FixPackIssue } from '../../fixpack/validate';

function StepTree({ pack, id, depth, seen }: { pack: FixPack; id: string; depth: number; seen: Set<string> }) {
  const step: Step | undefined = pack.steps[id];
  if (!step) return <li className="tree-missing">Missing step “{id}”</li>;
  if (seen.has(id) || depth > 12) return <li className="tree-missing">Loop back to {id}</li>;
  const nextSeen = new Set(seen).add(id);
  return (
    <li>
      <span className="tree-id">{id}</span> {step.instruction}
      {step.safety && <span className="pill pill-error tree-badge">safety: {step.safety}</span>}
      {step.pages && <span className="tree-pages">p. {step.pages}</span>}
      {step.outcome && (
        <div className={`tree-outcome outcome-${step.outcome.kind}`}>
          <strong>{step.outcome.kind}</strong>: {step.outcome.summary}
          {step.outcome.parts?.length ? ` · parts: ${step.outcome.parts.join(', ')}` : ''}
        </div>
      )}
      {step.ask && step.next && (
        <ul>
          {step.ask.options.map((opt) => (
            <li key={opt}>
              <span className="tree-option">
                {opt}
                {step.ask?.unit ? ` (${step.ask.unit})` : ''} →
              </span>
              <ul>
                <StepTree pack={pack} id={step.next![opt] ?? ''} depth={depth + 1} seen={nextSeen} />
              </ul>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export interface ReviewProps {
  json: string;
  onApply: (json: string) => void;
  onPublish?: (pack: FixPack) => Promise<void>;
  canPublish: boolean;
}

export function PackReview({ json, onApply, onPublish, canPublish }: ReviewProps) {
  const [draft, setDraft] = useState(json);
  const [open, setOpen] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setDraft(json), [json]);

  const result = useMemo(() => validateFixPackJson(json), [json]);
  const pack = result.ok ? result.pack : (() => { try { return JSON.parse(json) as FixPack; } catch { return null; } })();
  const issues: FixPackIssue[] = result.ok ? [] : result.issues;
  const issuePaths = new Set(issues.map((i) => i.path));

  function download() {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${pack?.packId ?? 'fixpack'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function publish() {
    if (!result.ok || !onPublish) return;
    setPublishing(true);
    setMessage(null);
    try {
      await onPublish(result.pack);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="card" aria-labelledby="review-title">
      <h2 id="review-title">Review {pack ? `· ${pack.brand} ${pack.family}` : ''}</h2>
      <div className="chips" data-testid="review-summary">
        <span className={`pill ${result.ok ? 'pill-ok' : 'pill-error'}`}>{result.ok ? 'Valid' : `${issues.length} issue${issues.length === 1 ? '' : 's'}`}</span>
        {pack && (
          <>
            <span className="pill pill-neutral">{pack.packId}</span>
            <span className="pill pill-neutral">v{pack.version}</span>
            <span className="pill pill-neutral">{pack.faultCodes?.length ?? 0} codes</span>
            <span className="pill pill-neutral">{Object.keys(pack.steps ?? {}).length} steps</span>
          </>
        )}
        <span className={`pill ${result.bytes <= MAX_PACK_BYTES ? 'pill-neutral' : 'pill-error'}`}>
          {(result.bytes / 1024).toFixed(1)} / {MAX_PACK_BYTES / 1024} KB
        </span>
      </div>

      {issues.length > 0 && (
        <ul className="issues" role="list" aria-label="Validation issues">
          {issues.map((i, n) => (
            <li key={n}>
              <code>{i.code}</code> <span className="tree-id">{i.path || '(pack)'}</span> {i.message}
            </li>
          ))}
        </ul>
      )}

      {pack?.faultCodes && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Shown as</th>
                <th scope="col">Meaning</th>
                <th scope="col">Likely causes</th>
                <th scope="col">Source</th>
                <th scope="col">Steps</th>
              </tr>
            </thead>
            <tbody>
              {pack.faultCodes.map((fc, i) => {
                const flagged = [...issuePaths].some((p) => p.startsWith(`faultCodes[${i}]`) || p.startsWith(`steps.${fc.firstStep.split('-')[0]}-`));
                return (
                  <FragmentRow key={fc.code} flagged={flagged} open={open === fc.code} onToggle={() => setOpen(open === fc.code ? null : fc.code)} fc={fc} pack={pack} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <details className="json-editor">
        <summary>Edit JSON</summary>
        <label className="sr-only" htmlFor="pack-json">
          Pack JSON
        </label>
        <textarea id="pack-json" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} rows={18} />
        <button type="button" className="secondary" onClick={() => onApply(draft)} disabled={draft === json}>
          Apply and re-validate
        </button>
      </details>

      <div className="form-actions">
        <button type="button" onClick={publish} disabled={!result.ok || !canPublish || publishing || !onPublish}>
          {publishing ? 'Publishing…' : 'Publish to technicians'}
        </button>
        <button type="button" className="secondary" onClick={download}>
          Download JSON
        </button>
        {!canPublish && <span className="lede">Only dispatchers can publish.</span>}
      </div>
      {message && (
        <p className="error-detail" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

function FragmentRow({ fc, pack, open, onToggle, flagged }: { fc: FixPack['faultCodes'][number]; pack: FixPack; open: boolean; onToggle: () => void; flagged: boolean }) {
  const source = pack.sourceRefs?.find((s) => s.id === fc.sourceRef);
  return (
    <>
      <tr className={flagged ? 'row-flagged' : undefined}>
        <td>
          <strong>{fc.code}</strong>
        </td>
        <td>{fc.display}</td>
        <td>{fc.meaning}</td>
        <td>{fc.likelyCauses?.join('; ')}</td>
        <td>
          {source ? (
            <a href={source.url} target="_blank" rel="noreferrer">
              p. {fc.pages}
            </a>
          ) : (
            `p. ${fc.pages}`
          )}
        </td>
        <td>
          <button type="button" className="secondary" aria-expanded={open} onClick={onToggle}>
            {open ? 'Hide' : 'Show'} steps
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6}>
            <ul className="tree">
              <StepTree pack={pack} id={fc.firstStep} depth={0} seen={new Set()} />
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
