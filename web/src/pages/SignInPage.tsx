import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { BrandMark } from '../ui/BrandMark';
import { Cloud, ListChecks, PlayCircle, Smartphone } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

export function SignInPage() {
  const { state, signIn, signInAsGuest } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'form' | 'demo' | null>(null);
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (state.status === 'signed-in') return <Navigate to={from} replace />;

  async function submit(emailValue: string, passwordValue: string) {
    setBusy('form');
    try {
      await signIn(emailValue, passwordValue);
    } catch {
      // The message is shown from the auth state.
    } finally {
      setBusy(null);
    }
  }

  async function demo() {
    setBusy('demo');
    await signInAsGuest();
    setBusy(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(email.trim(), password);
  }

  return (
    <div className="auth-layout">
      <section className="auth-hero" aria-labelledby="hero-title">
        <div className="brand" style={{ padding: 0 }}>
          <BrandMark size={34} />
          <span>
            <span className="brand-name">Fieldnote</span>
            <span className="brand-sub">Dispatch console</span>
          </span>
        </div>
        <div className="stack-sm" style={{ marginTop: 'auto' }}>
          <h1 id="hero-title" className="auth-title">
            Diagnosis that works in the basement.
          </h1>
          <p className="lede">
            Fieldnote turns manufacturer manuals into fix packs your technicians carry offline. On the job, the iPhone's own AI
            walks them through the fault with no signal. Back in range, the cloud writes the customer report.
          </p>
        </div>
        <ul className="tier-list">
          <li>
            <span className="stat-icon tone-ondevice">
              <Smartphone size={16} aria-hidden="true" />
            </span>
            <span>
              <strong>On-device first.</strong> Apple Intelligence on iPhone and Gemini Nano in Chrome: private, instant, $0.
            </span>
          </li>
          <li>
            <span className="stat-icon tone-cloud">
              <Cloud size={16} aria-hidden="true" />
            </span>
            <span>
              <strong>Cloud when it helps.</strong> Gemini compiles manuals and writes the full report.
            </span>
          </li>
          <li>
            <span className="stat-icon">
              <ListChecks size={16} aria-hidden="true" />
            </span>
            <span>
              <strong>Never a dead end.</strong> With no AI at all, the fix pack still guides every step.
            </span>
          </li>
        </ul>
      </section>

      <section className="auth-panel" aria-labelledby="signin-title">
        <div className="auth-card stack">
          <div className="stack-sm">
            <h2 id="signin-title" style={{ fontSize: 'var(--t-xl)' }}>
              Welcome
            </h2>
            <p className="muted">Explore the demo company, or sign in to your team's console.</p>
          </div>

          <button type="button" className="lg block" onClick={() => void demo()} disabled={busy !== null} data-testid="try-demo">
            {busy === 'demo' ? <span className="spinner" aria-hidden="true" /> : <PlayCircle size={18} aria-hidden="true" />}
            Try the demo
          </button>
          <p className="subtle" style={{ fontSize: 'var(--t-sm)', marginTop: -8 }}>
            No account needed. Fictional customers and jobs; you can run photo triage and browse everything.
          </p>

          <div className="divider">
            <span>or sign in</span>
          </div>

          <form className="form" style={{ marginTop: 0 }} onSubmit={onSubmit}>
            <label>
              Email
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {state.status === 'signed-out' && state.error && (
              <p className="error-detail" role="alert">
                {state.error}
              </p>
            )}
            <button type="submit" className="secondary lg" disabled={busy !== null}>
              {busy === 'form' ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          {import.meta.env.DEV && <DevDemoSignIn disabled={busy !== null} onSignIn={(e, p) => void submit(e, p)} />}
          <p className="subtle" style={{ fontSize: 'var(--t-sm)' }}>
            Checking whether your browser can run AI on-device? <Link to="/status">Hybrid status</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

/** Dev server only: passwords come from web/.env.development.local and never reach production. */
function DevDemoSignIn({ onSignIn, disabled }: { onSignIn: (email: string, password: string) => void; disabled: boolean }) {
  const dispatcher = import.meta.env.DEV ? import.meta.env.VITE_DEMO_DISPATCHER_PASSWORD : undefined;
  const tech = import.meta.env.DEV ? import.meta.env.VITE_DEMO_TECH_PASSWORD : undefined;
  if (!dispatcher && !tech) return null;
  return (
    <div className="form-actions" role="group" aria-label="Development sign-in" style={{ marginTop: 0 }}>
      {dispatcher && (
        <button type="button" className="ghost" disabled={disabled} onClick={() => onSignIn('dispatcher@demo.fieldnote.test', dispatcher)}>
          Dev: demo dispatcher
        </button>
      )}
      {tech && (
        <button type="button" className="ghost" disabled={disabled} onClick={() => onSignIn('tech@demo.fieldnote.test', tech)}>
          Dev: demo tech
        </button>
      )}
    </div>
  );
}
