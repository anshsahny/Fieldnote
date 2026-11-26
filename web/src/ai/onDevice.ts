/** Chrome's built-in model (Prompt API, Gemini Nano): what this browser can do right now. */

export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

interface PromptApi {
  availability(options: unknown): Promise<string>;
}

function promptApi(): PromptApi | undefined {
  const lm = (globalThis as { LanguageModel?: PromptApi }).LanguageModel;
  return lm && typeof lm.availability === 'function' ? lm : undefined;
}

export function normalizeAvailability(value: unknown): Availability {
  return value === 'available' || value === 'downloadable' || value === 'downloading' || value === 'unavailable'
    ? value
    : 'unavailable';
}

/** Same expected inputs that the hybrid session asks for (see ai/hybrid.ts buildModelParams). */
export async function browserAvailability(image: boolean): Promise<Availability> {
  const api = promptApi();
  if (!api) return 'unsupported';
  try {
    return normalizeAvailability(
      await api.availability({
        expectedInputs: [{ type: 'text', languages: ['en'] }, ...(image ? [{ type: 'image' }] : [])],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      }),
    );
  } catch {
    return 'unavailable';
  }
}

interface WarmSession {
  destroy?: () => void;
}

/**
 * Loads Gemini Nano before the first request. In the P6 eval the first on-device call took 59 s
 * (model load) and later ones about 4 s. Firebase AI Logic creates its own session on the first
 * call; the model stays loaded while this one is open. Call only when availability is
 * "available" (creating a session for a model that still has to download needs a user gesture).
 * Returns a disposer for effect cleanup.
 */
export function prewarmOnDevice(image: boolean): () => void {
  const lm = (globalThis as { LanguageModel?: { create?: (options: unknown) => Promise<WarmSession> } }).LanguageModel;
  if (typeof lm?.create !== 'function') return () => {};
  let session: WarmSession | undefined;
  let disposed = false;
  lm.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }, ...(image ? [{ type: 'image' }] : [])],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  })
    .then((s) => {
      if (disposed) s.destroy?.();
      else session = s;
    })
    .catch(() => {});
  return () => {
    disposed = true;
    session?.destroy?.();
  };
}

/** Chrome major version, from UA client hints when present. */
export function chromeVersion(nav: Navigator = navigator): number | undefined {
  const brands = (nav as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[] } }).userAgentData?.brands;
  const hint = brands?.find((b) => b.brand === 'Google Chrome' || b.brand === 'Chromium');
  if (hint) return Number(hint.version);
  const m = /Chrome\/(\d+)/.exec(nav.userAgent);
  return m ? Number(m[1]) : undefined;
}

export const AVAILABILITY_TEXT: Record<Availability, string> = {
  available: 'Ready on this device',
  downloadable: 'Supported; the model downloads on first use',
  downloading: 'Downloading the model…',
  unavailable: 'Not available on this device',
  unsupported: "This browser doesn't have Chrome's built-in AI",
};
