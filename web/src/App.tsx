import { lazy, Suspense, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { HomePage } from './pages/HomePage';
import { SignInPage } from './pages/SignInPage';

const PacksPage = lazy(() => import('./pages/packs/PacksPage').then((m) => ({ default: m.PacksPage })));

// Dev-only debug page: in production builds this branch is dropped, so the spike code
// (and its real AI calls) never ships to Hosting.
const SpikePage = import.meta.env.DEV
  ? lazy(() => import('./pages/spike/SpikePage').then((m) => ({ default: m.SpikePage })))
  : null;

function NotFound() {
  return (
    <section className="card" aria-labelledby="nf-title">
      <h1 id="nf-title">Page not found</h1>
      <p>
        <Link to="/">Back to the console</Link>
      </p>
    </section>
  );
}

function RequireSignIn({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <p className="lede">Checking your session…</p>;
  if (state.status !== 'signed-in') return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function AccountMenu() {
  const { state, signOut } = useAuth();
  if (state.status !== 'signed-in') {
    return (
      <NavLink to="/signin" className="nav-link">
        Sign in
      </NavLink>
    );
  }
  return (
    <span className="account">
      <span className="topbar-tag">
        {state.profile?.displayName ?? state.user.email} · {state.profile?.role ?? 'no profile'}
      </span>
      <button type="button" className="secondary" onClick={() => void signOut()}>
        Sign out
      </button>
    </span>
  );
}

const page = (node: ReactNode) => <Suspense fallback={<p className="lede">Loading…</p>}>{node}</Suspense>;

export function App() {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Fieldnote home">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          Fieldnote
        </Link>
        <nav aria-label="Main" className="nav">
          <NavLink to="/packs" className="nav-link">
            Fix packs
          </NavLink>
        </nav>
        <span className="spacer" />
        <AccountMenu />
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/packs" element={<RequireSignIn>{page(<PacksPage />)}</RequireSignIn>} />
          {SpikePage && <Route path="/spike" element={page(<SpikePage />)} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">
        Built with Firebase AI Logic hybrid inference · For licensed HVAC technicians
      </footer>
    </div>
  );
}
