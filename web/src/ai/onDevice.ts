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
