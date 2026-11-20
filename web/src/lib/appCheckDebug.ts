const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface DebugTokenInput {
  /** import.meta.env.DEV — false in every production build. */
  isDev: boolean;
  hostname: string;
  /** VITE_APPCHECK_DEBUG_TOKEN from web/.env.development.local (dev server only). */
  token?: string | undefined;
}

/**
 * Decides what to assign to `self.FIREBASE_APPCHECK_DEBUG_TOKEN`.
 *  - `undefined`: don't touch it → the real reCAPTCHA Enterprise provider runs (production).
 *  - a string: use this registered debug token (dev server on localhost).
 *  - `true`: dev on localhost without a token → the SDK generates one and logs it to the
 *    console so a new developer can register it in the Firebase console.
 */
export function resolveAppCheckDebugToken(input: DebugTokenInput): string | true | undefined {
  if (!input.isDev) return undefined;
  if (!LOCAL_HOSTS.has(input.hostname)) return undefined;
  const token = input.token?.trim();
  return token ? token : true;
}
