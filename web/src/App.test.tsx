import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const checkAppCheck = vi.fn();

vi.mock('./firebase/client', () => ({
  getFirebase: () => ({ app: {}, appCheck: {}, projectId: 'demo-project', appCheckMode: 'debug' }),
  checkAppCheck: (...args: unknown[]) => checkAppCheck(...args),
  getDb: () => ({}),
  getAuthClient: () => ({}),
}));

// Remote Config isn't reachable in tests: the hook keeps the bundled template defaults.
vi.mock('./ai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ai/config')>();
  return { ...actual, loadAIConfig: async () => actual.aiConfigFrom(() => undefined, 'defaults') };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  beforeEach(() => checkAppCheck.mockReset());

  it('sends signed-out visitors to sign-in with a one-click demo', async () => {
    renderAt('/');
    expect(await screen.findByRole('button', { name: /Try the demo/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Diagnosis that works in the basement.' })).toBeInTheDocument();
  });

  it('hybrid status reports App Check and this browser’s on-device model', async () => {
    checkAppCheck.mockResolvedValue({ ok: true });
    renderAt('/status');
    // No token request on page load (reCAPTCHA scores early, interaction-free requests low).
    expect(await screen.findByText('Checked on the first AI call')).toBeInTheDocument();
    expect(checkAppCheck).not.toHaveBeenCalled();
    (await screen.findByRole('button', { name: 'Check now' })).click();
    expect(await screen.findByText(/Token acquired · debug provider/)).toBeInTheDocument();
    expect(screen.getByTestId('project-id')).toHaveTextContent('demo-project');
    // jsdom has no Prompt API, like a browser without Chrome's built-in AI.
    expect((await screen.findAllByText(/doesn't have Chrome's built-in AI/)).length).toBe(2);
    expect(screen.getByRole('button', { name: /Test the on-device model/ })).toBeDisabled();
  });

  it('surfaces App Check failures instead of hiding them', async () => {
    checkAppCheck.mockResolvedValue({ ok: false, error: 'AppCheck: 403 error. Attempts allowed again after 01d:00m:00s (appCheck/initial-throttle).' });
    renderAt('/status');
    (await screen.findByRole('button', { name: 'Check now' })).click();
    expect(await screen.findByText('Not ready')).toBeInTheDocument();
    expect(screen.getByText(/didn't pass Google's bot check/)).toBeInTheDocument();
  });

  it('shows a not-found page for unknown routes', async () => {
    renderAt('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('has a labelled main navigation', async () => {
    renderAt('/about');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(nav).toHaveTextContent('Photo triage');
    expect(nav).toHaveTextContent('Hybrid ledger');
  });
});
