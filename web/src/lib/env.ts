import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

/** Public Firebase web config + reCAPTCHA site key. These ship in the bundle by design. */
export const PublicEnvSchema = z.object({
  VITE_FIREBASE_API_KEY: nonEmpty,
  VITE_FIREBASE_AUTH_DOMAIN: nonEmpty,
  VITE_FIREBASE_PROJECT_ID: nonEmpty,
  VITE_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  VITE_FIREBASE_MESSAGING_SENDER_ID: nonEmpty,
  VITE_FIREBASE_APP_ID: nonEmpty,
  VITE_FIREBASE_MEASUREMENT_ID: z.string().optional(),
  VITE_RECAPTCHA_SITE_KEY: nonEmpty,
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

export class EnvError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `Missing or empty env vars: ${missing.join(', ')}. ` +
        'Copy web/.env.example to web/.env.local (or run node scripts/setup-local-secrets.mjs).',
    );
    this.name = 'EnvError';
    this.missing = missing;
  }
}

/** Validates the env; error messages name keys only, never values. */
export function parsePublicEnv(raw: Record<string, unknown>): PublicEnv {
  const result = PublicEnvSchema.safeParse(raw);
  if (!result.success) {
    const missing = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    throw new EnvError(missing);
  }
  return result.data;
}

export function firebaseOptionsFrom(env: PublicEnv) {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
  };
}
