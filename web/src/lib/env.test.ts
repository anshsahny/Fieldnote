import { describe, expect, it } from 'vitest';
import { EnvError, firebaseOptionsFrom, parsePublicEnv } from './env';

const valid = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
  VITE_RECAPTCHA_SITE_KEY: 'site-key',
};

describe('parsePublicEnv', () => {
  it('accepts a complete config', () => {
    expect(parsePublicEnv(valid).VITE_FIREBASE_PROJECT_ID).toBe('demo-project');
  });

  it('names missing keys without echoing any values', () => {
    const { VITE_RECAPTCHA_SITE_KEY: _omit, ...rest } = valid;
    const bad = { ...rest, VITE_FIREBASE_API_KEY: '   ' };
    try {
      parsePublicEnv(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const err = e as EnvError;
      expect(err.missing.sort()).toEqual(['VITE_FIREBASE_API_KEY', 'VITE_RECAPTCHA_SITE_KEY']);
      expect(err.message).not.toContain('demo-project');
    }
  });

  it('ignores unrelated keys such as the dev-only debug token', () => {
    const env = parsePublicEnv({ ...valid, VITE_APPCHECK_DEBUG_TOKEN: 'secret' });
    expect(env).not.toHaveProperty('VITE_APPCHECK_DEBUG_TOKEN');
  });
});

describe('firebaseOptionsFrom', () => {
  it('maps env vars to Firebase options and drops empty optionals', () => {
    const opts = firebaseOptionsFrom(parsePublicEnv({ ...valid, VITE_FIREBASE_MEASUREMENT_ID: '' }));
    expect(opts).toMatchObject({ apiKey: 'k', projectId: 'demo-project', appId: '1:123:web:abc' });
    expect(opts.measurementId).toBeUndefined();
  });
});
