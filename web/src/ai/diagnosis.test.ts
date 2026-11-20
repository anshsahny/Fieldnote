import { describe, expect, it } from 'vitest';
import { diagnosisSchema, extractJsonObject, validateDecision } from './diagnosis';

const allowed = ['runs', 'does not run', 'runs noisy'];

describe('validateDecision', () => {
  it('accepts a good payload and normalizes the choice casing', () => {
    const r = validateDecision('{"choice":"Does Not Run","confidence":0.82,"say":"Inducer is silent."}', allowed);
    expect(r).toEqual({ ok: true, decision: { choice: 'does not run', confidence: 0.82, say: 'Inducer is silent.' } });
  });

  it('accepts JSON wrapped in fences and chatter', () => {
    const r = validateDecision('Sure!\n```json\n{"choice":"unclear","confidence":"0.3","say":"Need more info."}\n```', allowed);
    expect(r.ok && r.decision.choice).toBe('unclear');
  });

  it.each([
    ['malformed', '{"choice": "runs", "confidence": 0.9, "say": }', /Malformed/],
    ['no JSON', 'The inducer runs.', /No JSON/],
    ['out-of-enum', '{"choice":"replace board","confidence":0.9,"say":"x"}', /not an allowed choice/],
    ['confidence > 1', '{"choice":"runs","confidence":7,"say":"x"}', /confidence/],
    ['empty say', '{"choice":"runs","confidence":0.5,"say":"  "}', /say/],
  ])('rejects %s', (_, text, err) => {
    const r = validateDecision(text, allowed);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(err);
  });
});

describe('extractJsonObject', () => {
  it('handles braces inside strings', () => {
    expect(extractJsonObject('x {"say":"a } b","n":{"k":1}} y')).toBe('{"say":"a } b","n":{"k":1}}');
  });
});

describe('diagnosisSchema', () => {
  it('constrains choice to the allowed keys plus unclear', () => {
    const s = diagnosisSchema(allowed) as { properties: { choice: { enum: string[] } } };
    expect(s.properties.choice.enum).toEqual([...allowed, 'unclear']);
  });
});
