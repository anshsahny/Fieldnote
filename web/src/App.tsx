import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChartColumn,
  ClipboardList,
  Cpu,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  ScanSearch,
  Sun,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { SignInPage } from './pages/SignInPage';
import { initials } from './ui/format';
import { applyTheme, readTheme, type ThemeChoice } from './ui/theme';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const JobsPage = lazy(() => import('./pages/jobs/JobsPage').then((m) => ({ default: m.JobsPage })));
const JobDetailPage = lazy(() => import('./pages/jobs/JobDetailPage').then((m) => ({ default: m.JobDetailPage })));
const TriagePage = lazy(() => import('./pages/triage/TriagePage').then((m) => ({ default: m.TriagePage })));
const PacksPage = lazy(() => import('./pages/packs/PacksPage').then((m) => ({ default: m.PacksPage })));
const LedgerPage = lazy(() => import('./pages/ledger/LedgerPage').then((m) => ({ default: m.LedgerPage })));
const StatusPage = lazy(() => import('./pages/StatusPage').then((m) => ({ default: m.StatusPage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));

// Dev-only debug page: in production builds this branch is dropped, so the spike code
// (and its real AI calls) never ships to Hosting.
const SpikePage = import.meta.env.DEV
  ? lazy(() => import('./pages/spike/SpikePage').then((m) => ({ default: m.SpikePage })))
  : null;
const EvalPage = import.meta.env.DEV
  ? lazy(() => import('./pages/eval/EvalPage').then((m) => ({ default: m.EvalPage })))
  : null;

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: { section: string; items: NavEntry[] }[] = [
  {
    section: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/jobs', label: 'Jobs', icon: ClipboardList },
      { to: '/triage', label: 'Photo triage', icon: ScanSearch },
    ],
  },
  { section: 'Knowledge', items: [{ to: '/packs', label: 'Fix packs', icon: BookOpen }] },
  { section: 'Insights', items: [{ to: '/ledger', label: 'Hybrid ledger', icon: ChartColumn }] },
  {
    section: 'System',
    items: [
      { to: '/status', label: 'Hybrid status', icon: Cpu },
      { to: '/about', label: 'How it works', icon: Info },
    ],
  },
];

function NotFound() {
  return (
    <section className="card" aria-labelledby="nf-title">
      <h1 id="nf-title">Page not found</h1>
      <p className="lede" style={{ marginTop: 8 }}>
        <Link to="/">Back to the dashboard</Link>
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

function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  const options: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
    { value: 'system', label: 'System theme', icon: Monitor },
    { value: 'light', label: 'Light theme', icon: Sun },
    { value: 'dark', label: 'Dark theme', icon: Moon },
  ];
  return (
    <div className="segmented" role="group" aria-label="Theme">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          aria-label={label}
          title={label}
          onClick={() => {
            setChoice(value);
            applyTheme(value);
          }}
        >
          <Icon size={15} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function AccountCard() {
  const { state, signOut } = useAuth();
  if (state.status === 'loading') return <span className="skeleton" style={{ height: 40 }} aria-hidden="true" />;
  if (state.status !== 'signed-in') {
    return (
      <Link to="/signin" className="btn btn-secondary block">
        Sign in
      </Link>
    );
  }
  const guest = state.profile?.role === 'guest';
  const name = state.profile?.displayName ?? state.user.email ?? 'Signed in';
  const role = guest ? 'Demo · read-mostly' : state.profile?.role === 'dispatcher' ? 'Dispatcher' : (state.profile?.role ?? 'No profile');
  return (
    <div className="account-card">
      <span className="avatar" aria-hidden="true">
        {guest ? 'D' : initials(name)}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="account-name">{name}</div>
        <div className="account-role">{role}</div>
      </div>
      <button type="button" className="ghost icon-only" onClick={() => void signOut()} aria-label={guest ? 'Exit demo' : 'Sign out'} title={guest ? 'Exit demo' : 'Sign out'}>
        <LogOut size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav className="sidebar" aria-label="Main">
      <Link to="/" className="brand" onClick={onNavigate}>
        <span className="brand-mark" aria-hidden="true">
          <Wrench size={18} strokeWidth={2.4} />
        </span>
        <span>
          <span className="brand-name">Fieldnote</span>
          <span className="brand-sub">Dispatch console</span>
        </span>
      </Link>
      {NAV.map((group) => (
        <div key={group.section}>
          <div className="nav-section">{group.section}</div>
          {group.items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-item" onClick={onNavigate}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="sidebar-footer">
        <ThemeToggle />
        <AccountCard />
      </div>
    </nav>
  );
}

const page = (node: ReactNode) => (
  <Suspense
    fallback={
      <div className="stack-sm" aria-busy="true">
        <span className="skeleton" style={{ height: 34, width: 260 }} />
        <span className="skeleton" style={{ height: 18, width: 420 }} />
      </div>
    }
  >
    {node}
  </Suspense>
);

function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Move focus to the page on navigation (screen readers announce the new page).
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="app" data-nav-open={navOpen}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <div className="content">
        <div className="mobile-bar">
          <button type="button" className="ghost icon-only" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="brand-mark" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8 }}>
            <Wrench size={15} strokeWidth={2.4} />
          </span>
          <strong>Fieldnote</strong>
        </div>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<RequireSignIn>{page(<DashboardPage />)}</RequireSignIn>} />
            <Route path="/jobs" element={<RequireSignIn>{page(<JobsPage />)}</RequireSignIn>} />
            <Route path="/jobs/:jobId" element={<RequireSignIn>{page(<JobDetailPage />)}</RequireSignIn>} />
            <Route path="/triage" element={<RequireSignIn>{page(<TriagePage />)}</RequireSignIn>} />
            <Route path="/packs" element={<RequireSignIn>{page(<PacksPage />)}</RequireSignIn>} />
            <Route path="/ledger" element={<RequireSignIn>{page(<LedgerPage />)}</RequireSignIn>} />
            <Route path="/status" element={page(<StatusPage />)} />
            <Route path="/about" element={page(<AboutPage />)} />
            {SpikePage && <Route path="/spike" element={page(<SpikePage />)} />}
            {EvalPage && <Route path="/eval" element={page(<EvalPage />)} />}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <footer className="footer">
          Fieldnote · Firebase AI Logic hybrid inference · Demo data is fictional · For licensed HVAC technicians
        </footer>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}
