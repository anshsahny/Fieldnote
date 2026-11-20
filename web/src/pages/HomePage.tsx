import { useEffect, useState } from 'react';
import { checkAppCheck, getFirebase } from '../firebase/client';

type Status =
  | { kind: 'checking' }
  | { kind: 'ready'; projectId: string; mode: string }
  | { kind: 'error'; message: string; projectId?: string };

const MODE_LABEL: Record<string, string> = {
  debug: 'debug provider (localhost)',
  'recaptcha-enterprise': 'reCAPTCHA Enterprise',
};

export function HomePage() {
  const [status, setStatus] = useState<Status>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fb = getFirebase();
        const result = await checkAppCheck(fb.appCheck);
        if (cancelled) return;
        setStatus(
          result.ok
            ? { kind: 'ready', projectId: fb.projectId, mode: MODE_LABEL[fb.appCheckMode] ?? fb.appCheckMode }
            : { kind: 'error', message: result.error, projectId: fb.projectId },
        );
      } catch (e) {
        if (!cancelled) setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="home-title" className="card">
      <h1 id="home-title">Fieldnote console</h1>
      <p className="lede">
        Manuals in, fix packs out. Customer photos triaged on-device. This is the Phase 0 placeholder:
        Firebase and App Check are wired; AI features arrive in Phase 1.
      </p>

      <h2>Setup status</h2>
      <dl className="status" aria-live="polite">
        <dt>Firebase project</dt>
        <dd data-testid="project-id">
          {status.kind === 'checking' ? '…' : (status.projectId ?? 'not configured')}
        </dd>

        <dt>App Check</dt>
        <dd data-testid="appcheck-status">
          {status.kind === 'checking' && <span className="pill pill-neutral">Checking…</span>}
          {status.kind === 'ready' && (
            <span className="pill pill-ok">Token acquired · {status.mode}</span>
          )}
          {status.kind === 'error' && (
            <>
              <span className="pill pill-error">Not ready</span>
              <span className="error-detail">{status.message}</span>
            </>
          )}
        </dd>

        <dt>AI Logic</dt>
        <dd>
          <span className="pill pill-neutral">Not called yet (Phase 1)</span>
        </dd>
      </dl>
    </section>
  );
}
