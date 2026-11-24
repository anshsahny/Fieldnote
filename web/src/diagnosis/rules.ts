import safetyStopsFile from '../../../shared/safety-stops.json';
import { UNCLEAR } from '../ai/diagnosis';
import { PROMPTS, renderPrompt } from '../ai/prompts';
import type { SafetyStop, Step } from '../fixpack/schema';

/**
 * The diagnosis rules that are code, not model, ported from the iPhone so the web eval runner
 * scores Chrome's models exactly like the app scores Apple's:
 *   - SafetyGuard          ← ios/Fieldnote/Core/SafetyGuard.swift
 *   - isHedged             ← ios/Fieldnote/Core/HedgeDetector.swift
 *   - clarificationFor     ← DiagnosisEngine.clarification
 *   - buildDiagnosisPrompt ← ios/Fieldnote/Core/DiagnosisPrompt.swift
 * shared/fixtures/diagnosis/rules.json is run by both test suites.
 */

export const UNIVERSAL_STOPS = (safetyStopsFile as { safetyStops: SafetyStop[] }).safetyStops;

/**
 * Lowercased words with light stemming ("smells" → "smell", "sparking" → "spark"). Apostrophes are
 * dropped first so contractions stay one word: "something's burning" must not push "burning" out of
 * the matching window (found by the P6 scenarios).
 */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stem);
}

export function stem(w: string): string {
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  return w;
}

/** Trigger words in order, allowing up to two other words between consecutive trigger words. */
export function matches(trigger: string[], words: string[]): boolean {
  const [first, ...rest] = trigger;
  if (!first) return false;
  for (let start = 0; start < words.length; start++) {
    if (words[start] !== first) continue;
    let position = start;
    let matched = true;
    for (const word of rest) {
      if (position + 1 >= words.length) {
        matched = false;
        break;
      }
      let hit = -1;
      for (let i = position + 1; i <= Math.min(position + 3, words.length - 1); i++) {
        if (words[i] === word) {
          hit = i;
          break;
        }
      }
      if (hit < 0) {
        matched = false;
        break;
      }
      position = hit;
    }
    if (matched) return true;
  }
  return false;
}

/** Deterministic safety check on the technician's free text; runs before any model call. */
export class SafetyGuard {
  private readonly rules: { stop: SafetyStop; triggers: string[][] }[];

  /** Merges the pack's stops with the universal stops (union of triggers by id). */
  constructor(packStops: SafetyStop[], universal: SafetyStop[] = UNIVERSAL_STOPS) {
    const byId = new Map<string, SafetyStop>();
    for (const stop of [...universal, ...packStops]) {
      const existing = byId.get(stop.id);
      byId.set(
        stop.id,
        existing ? { ...existing, triggers: [...existing.triggers, ...stop.triggers.filter((t) => !existing.triggers.includes(t))] } : stop,
      );
    }
    this.rules = [...byId.values()].map((stop) => ({ stop, triggers: stop.triggers.map(tokens).filter((t) => t.length > 0) }));
  }

  check(text: string): SafetyStop | undefined {
    const words = tokens(text);
    if (words.length === 0) return undefined;
    return this.rules.find((r) => r.triggers.some((t) => matches(t, words)))?.stop;
  }
}

const HEDGES = [
  'not sure', 'unsure', 'maybe', 'might', 'i think', 'probably', 'possibly', 'not certain',
  "can't tell", 'cant tell', 'hard to tell', 'i guess', 'guessing',
  "haven't checked", 'havent checked', "haven't looked", 'havent looked', 'not checked',
];

/** A guess must not move the diagnosis forward on its own: hedged notes always ask. */
export function isHedged(note: string): boolean {
  const words = note
    .toLowerCase()
    .replace(/’/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
  const text = ` ${words.join(' ')} `;
  return HEDGES.some((h) => text.includes(` ${h} `));
}

export type Clarification = 'unclear' | 'lowConfidence' | 'hedged';

/** When a model answer may advance the diagnosis (undefined = advance). */
export function clarificationFor(d: { choice: string; confidence: number }, note: string, threshold: number): Clarification | undefined {
  if (d.choice === UNCLEAR) return 'unclear';
  if (d.confidence < threshold) return 'lowConfidence';
  if (isHedged(note)) return 'hedged';
  return undefined;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  allowed: string[];
  tokenEstimate: number;
}

export const SCHEMA_OVERHEAD_TOKENS = 200;
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);

/** Only the current step, its allowed answers and the last three history items (never the whole pack). */
export function buildDiagnosisPrompt(step: Step, history: { instruction: string; answer: string }[], note: string): BuiltPrompt {
  const allowed = step.ask?.options ?? [];
  const recent = history.slice(-3);
  const unit = step.ask?.unit ? ` (unit: ${step.ask.unit})` : '';
  const p = renderPrompt(PROMPTS.diagnosis, {
    step_instruction: step.instruction + unit,
    allowed_choices: allowed.join(' | '),
    history: recent.length ? recent.map((h) => `${h.instruction} → ${h.answer}`).join('; ') : 'none',
    note: note.slice(0, 500),
  });
  return {
    system: p.system,
    user: p.user,
    allowed,
    tokenEstimate: estimateTokens(p.system) + estimateTokens(p.user) + SCHEMA_OVERHEAD_TOKENS,
  };
}
