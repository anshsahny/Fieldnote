import { describe, expect, it } from 'vitest';
import { isAppCheckFailure } from './appCheckErrors';

describe('isAppCheckFailure', () => {
  it('recognizes App Check rejections from the SDKs', () => {
    expect(isAppCheckFailure('AppCheck: 403 error. Attempts allowed again after 01d:00m:00s (appCheck/initial-throttle).')).toBe(true);
    expect(
      isAppCheckFailure(
        'AI: Error fetching from https://firebasevertexai.googleapis.com/...:generateContent: [401 ] Firebase App Check token is invalid.',
      ),
    ).toBe(true);
    expect(isAppCheckFailure('reCAPTCHA error: score too low')).toBe(true);
  });

  it('leaves other failures alone', () => {
    expect(isAppCheckFailure('[429 ] Resource exhausted')).toBe(false);
    expect(isAppCheckFailure('The model did not return JSON.')).toBe(false);
  });
});
