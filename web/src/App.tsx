import { Link, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';

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
        <span className="topbar-tag">Dispatcher console</span>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">
        Built with Firebase AI Logic hybrid inference · For licensed HVAC technicians
      </footer>
    </div>
  );
}
