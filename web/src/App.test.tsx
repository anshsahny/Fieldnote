import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const checkAppCheck = vi.fn();

vi.mock('./firebase/client', () => ({
  getFirebase: () => ({ appCheck: {}, projectId: 'demo-project', appCheckMode: 'debug' }),
  checkAppCheck: (...args: unknown[]) => checkAppCheck(...args),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  beforeEach(() => checkAppCheck.mockReset());

  it('renders the placeholder and reports a healthy App Check token', async () => {
    checkAppCheck.mockResolvedValue({ ok: true });
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Fieldnote console' })).toBeInTheDocument();
    expect(await screen.findByText(/Token acquired · debug provider/)).toBeInTheDocument();
    expect(screen.getByTestId('project-id')).toHaveTextContent('demo-project');
  });

  it('surfaces App Check failures instead of hiding them', async () => {
    checkAppCheck.mockResolvedValue({ ok: false, error: 'appCheck/fetch-status-error' });
    renderAt('/');
    expect(await screen.findByText('Not ready')).toBeInTheDocument();
    expect(screen.getByText('appCheck/fetch-status-error')).toBeInTheDocument();
  });

  it('shows a not-found page for unknown routes', () => {
    checkAppCheck.mockResolvedValue({ ok: true });
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
