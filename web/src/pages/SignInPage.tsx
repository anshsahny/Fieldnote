import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function SignInPage() {
  const { state, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/packs';

  if (state.status === 'signed-in') return <Navigate to={from} replace />;

  async function submit(emailValue: string, passwordValue: string) {
    setBusy(true);
    try {
      await signIn(emailValue, passwordValue);
    } catch {
      // The message is shown from the auth state.
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(email.trim(), password);
  }

  return (
    <section className="card narrow" aria-labelledby="signin-title">
      <h1 id="signin-title">Sign in</h1>
      <p className="lede">Dispatcher console for your service team.</p>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {state.status === 'signed-out' && state.error && (
          <p className="error-detail" role="alert">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {import.meta.env.DEV && <DevDemoSignIn disabled={busy} onSignIn={(e, p) => void submit(e, p)} />}
    </section>
  );
}

/** Dev server only: passwords come from web/.env.development.local and never reach production. */
function DevDemoSignIn({ onSignIn, disabled }: { onSignIn: (email: string, password: string) => void; disabled: boolean }) {
  const dispatcher = import.meta.env.DEV ? import.meta.env.VITE_DEMO_DISPATCHER_PASSWORD : undefined;
  const tech = import.meta.env.DEV ? import.meta.env.VITE_DEMO_TECH_PASSWORD : undefined;
  if (!dispatcher && !tech) return null;
  return (
    <div className="form-actions" role="group" aria-label="Development sign-in">
      {dispatcher && (
        <button type="button" className="secondary" disabled={disabled} onClick={() => onSignIn('dispatcher@demo.fieldnote.test', dispatcher)}>
          Dev: demo dispatcher
        </button>
      )}
      {tech && (
        <button type="button" className="secondary" disabled={disabled} onClick={() => onSignIn('tech@demo.fieldnote.test', tech)}>
          Dev: demo tech
        </button>
      )}
    </div>
  );
}
