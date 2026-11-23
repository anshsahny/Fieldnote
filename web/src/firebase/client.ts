import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import { firebaseOptionsFrom, parsePublicEnv } from '../lib/env';
import { resolveAppCheckDebugToken } from '../lib/appCheckDebug';

declare global {
  // Read by the App Check SDK at initializeAppCheck() time.
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

export interface FirebaseClient {
  app: FirebaseApp;
  appCheck: AppCheck;
  projectId: string;
  appCheckMode: 'debug' | 'recaptcha-enterprise';
}

let client: FirebaseClient | undefined;

/**
 * Initializes Firebase + App Check exactly once. App Check must be initialized before any
 * Firebase AI Logic / Firestore call (App Check is enforced for AI Logic in this project).
 */
export function getFirebase(): FirebaseClient {
  if (client) return client;

  const env = parsePublicEnv(import.meta.env as unknown as Record<string, unknown>);
  const app = initializeApp(firebaseOptionsFrom(env));

  const debugToken = resolveAppCheckDebugToken({
    isDev: import.meta.env.DEV,
    hostname: globalThis.location?.hostname ?? '',
    // Only defined under `vite dev`; production builds never load .env.development.local.
    token: import.meta.env.DEV ? import.meta.env.VITE_APPCHECK_DEBUG_TOKEN : undefined,
  });
  if (debugToken !== undefined) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  // Auto-refresh off: with it on, the SDK exchanges a reCAPTCHA token the moment the page loads,
  // before any interaction. A brand-new browser then scores low, App Check rejects it, and the SDK
  // pauses cloud AI in that browser for a day. On demand, the first token is requested when
  // something needs it (an AI call, or data after "Try the demo") and is reused until it expires.
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: false,
  });

  client = {
    app,
    appCheck,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appCheckMode: debugToken === undefined ? 'recaptcha-enterprise' : 'debug',
  };
  return client;
}

/** Firestore and Auth share the App Check-protected app instance. */
export const getDb = (): Firestore => getFirestore(getFirebase().app);
export const getAuthClient = (): Auth => getAuth(getFirebase().app);

export type AppCheckStatus = { ok: true } | { ok: false; error: string };

/** Smoke check: can this client obtain an App Check token? (No AI call.) */
export async function checkAppCheck(appCheck: AppCheck): Promise<AppCheckStatus> {
  try {
    const result = await getToken(appCheck, false);
    return result.token ? { ok: true } : { ok: false, error: 'Empty App Check token' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
