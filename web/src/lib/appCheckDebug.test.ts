import { describe, expect, it } from 'vitest';
import { resolveAppCheckDebugToken } from './appCheckDebug';

describe('resolveAppCheckDebugToken', () => {
  it('never enables debug mode in production builds', () => {
    expect(resolveAppCheckDebugToken({ isDev: false, hostname: 'localhost', token: 'tok' })).toBeUndefined();
  });

  it('never enables debug mode on a non-local host, even in dev', () => {
    expect(
      resolveAppCheckDebugToken({ isDev: true, hostname: 'fieldnote-c28dc.web.app', token: 'tok' }),
    ).toBeUndefined();
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])('uses the configured token on %s', (hostname) => {
    expect(resolveAppCheckDebugToken({ isDev: true, hostname, token: ' tok ' })).toBe('tok');
  });

  it('asks the SDK to generate a token when none is configured', () => {
    expect(resolveAppCheckDebugToken({ isDev: true, hostname: 'localhost', token: '' })).toBe(true);
    expect(resolveAppCheckDebugToken({ isDev: true, hostname: 'localhost' })).toBe(true);
  });
});
