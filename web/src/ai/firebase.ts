import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { getFirebase } from '../firebase/client';

let ai: AI | undefined;

/**
 * Firebase AI Logic (Gemini Developer API). App Check is initialized first by getFirebase().
 * Limited-use App Check tokens enable replay protection, which some models require.
 */
export function getAIInstance(): AI {
  ai ??= getAI(getFirebase().app, {
    backend: new GoogleAIBackend(),
    useLimitedUseAppCheckTokens: true,
  });
  return ai;
}
