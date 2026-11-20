// Diagnosis decision: the model maps a tech's note to one of the step's allowed choices.
// Same contract as ios/Fieldnote/AI/DiagnosisDecision.swift. Code, not the model, decides
// whether the answer is usable.

export const UNCLEAR = 'unclear';

export interface DiagnosisDecision {
  choice: string;
  confidence: number;
  say: string;
}

export type DecisionResult =
  | { ok: true; decision: DiagnosisDecision }
  | { ok: false; error: string };

/** JSON schema used for structured output (cloud responseSchema + on-device responseConstraint). */
export function diagnosisSchema(allowed: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      choice: { type: 'string', enum: [...allowed, UNCLEAR] },
      confidence: { type: 'number' },
      say: { type: 'string' },
    },
    required: ['choice', 'confidence', 'say'],
  };
}

/** Pulls the first JSON object out of model text (tolerates ```json fences and chatter). */
export function extractJsonObject(text: string): string | null {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < unfenced.length; i++) {
    const c = unfenced[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return unfenced.slice(start, i + 1);
  }
  return null;
}

export function validateDecision(text: string, allowed: string[]): DecisionResult {
  const json = extractJsonObject(text);
  if (!json) return { ok: false, error: 'No JSON object in the response' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Malformed JSON' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Response is not an object' };
  const { choice, confidence, say } = raw as Record<string, unknown>;
  if (typeof choice !== 'string') return { ok: false, error: '"choice" must be a string' };
  const normalized = choice.trim();
  const match = [...allowed, UNCLEAR].find((a) => a.toLowerCase() === normalized.toLowerCase());
  if (!match) return { ok: false, error: `"choice" "${normalized}" is not an allowed choice` };
  const conf = typeof confidence === 'string' ? Number(confidence) : confidence;
  if (typeof conf !== 'number' || !Number.isFinite(conf) || conf < 0 || conf > 1) {
    return { ok: false, error: '"confidence" must be a number from 0 to 1' };
  }
  if (typeof say !== 'string' || !say.trim()) return { ok: false, error: '"say" must be a non-empty string' };
  return { ok: true, decision: { choice: match, confidence: conf, say: say.trim().slice(0, 400) } };
}

/** Triage (photo pre-triage) structured output. */
export const TRIAGE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    brand: { type: 'string' },
    model: { type: 'string' },
    errorCode: { type: 'string' },
    likelyFault: { type: 'string' },
    partsToBring: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
  required: ['brand', 'model', 'errorCode', 'likelyFault', 'partsToBring', 'confidence'],
};
