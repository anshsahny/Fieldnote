import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateFixPackJson } from '../fixpack/validate';
import { buildDiagnosisPrompt, clarificationFor, isHedged, SafetyGuard } from './rules';

// Same cases as ios/FieldnoteTests/SharedRulesTests.swift.
const root = join(process.cwd(), '..');
const cases = JSON.parse(readFileSync(join(root, 'shared/fixtures/diagnosis/rules.json'), 'utf8')) as {
  safety: { text: string; stop: string | null }[];
  hedge: { text: string; hedged: boolean }[];
  clarify: { choice: string; confidence: number; note: string; expect: string }[];
  threshold: number;
};

describe('shared diagnosis rules (same cases as iOS)', () => {
  const guardian = new SafetyGuard([]);

  it.each(cases.safety)('safety: "$text" → $stop', ({ text, stop }) => {
    expect(guardian.check(text)?.id ?? null).toBe(stop);
  });

  it.each(cases.hedge)('hedge: "$text" → $hedged', ({ text, hedged }) => {
    expect(isHedged(text)).toBe(hedged);
  });

  it.each(cases.clarify)('clarify: $choice @ $confidence, "$note" → $expect', ({ choice, confidence, note, expect: kind }) => {
    expect(clarificationFor({ choice, confidence }, note, cases.threshold) ?? 'advance').toBe(kind);
  });
});

describe('buildDiagnosisPrompt', () => {
  const r = validateFixPackJson(readFileSync(join(root, 'content/fixpacks/goodman-cvc96-mvc96-v1.json'), 'utf8'));
  if (!r.ok) throw new Error('pack invalid');
  const pack = r.pack;

  it('sends only the current step, its answers and the last three history items', () => {
    const step = pack.steps['CEE0-S5']!;
    const history = ['a', 'b', 'c', 'd'].map((x) => ({ instruction: `step ${x}`, answer: x }));
    const p = buildDiagnosisPrompt(step, history, 'found a bird nest in the exhaust');
    expect(p.allowed).toEqual(step.ask!.options);
    expect(p.user).toContain('blocked | clear');
    expect(p.user).not.toContain('step a'); // oldest history item dropped
    expect(p.user).toContain('step d → d');
    expect(p.user).toContain('bird nest');
  });

  it('every step of every pack fits the on-device budget', () => {
    for (const id of ['goodman-cvc96-mvc96-v1', 'carrier-59sc5b-v1', 'rheem-r96v-v1']) {
      const res = validateFixPackJson(readFileSync(join(root, `content/fixpacks/${id}.json`), 'utf8'));
      if (!res.ok) throw new Error(id);
      for (const step of Object.values(res.pack.steps)) {
        if (!step.ask) continue;
        const history = Array.from({ length: 3 }, () => ({ instruction: 'x'.repeat(200), answer: 'y'.repeat(60) }));
        expect(buildDiagnosisPrompt(step, history, 'z'.repeat(500)).tokenEstimate).toBeLessThanOrEqual(3000);
      }
    }
  });
});
