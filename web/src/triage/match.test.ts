import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateFixPackJson } from '../fixpack/validate';
import type { FixPack } from '../fixpack/schema';
import { findPack, lookupCode, matchTriage, normalizeCode, packParts, parseTriage, type TriageReading } from './match';

const root = join(process.cwd(), '..');
const load = (id: string): FixPack => {
  const r = validateFixPackJson(readFileSync(join(root, 'content', 'fixpacks', `${id}.json`), 'utf8'));
  if (!r.ok) throw new Error(`${id} invalid`);
  return r.pack;
};
const goodman = load('goodman-cvc96-mvc96-v1');
const carrier = load('carrier-59sc5b-v1');
const rheem = load('rheem-r96v-v1');
const packs = [carrier, goodman, rheem];

const reading = (r: Partial<TriageReading>): TriageReading => ({ likelyFault: 'x', partsToBring: [], confidence: 0.8, ...r });

describe('parseTriage', () => {
  it('reads the structured answer and drops "unknown" fields', () => {
    const r = parseTriage(
      '```json\n{"brand":"Goodman","model":"unknown","errorCode":"EE2","likelyFault":"Pressure switch open","partsToBring":["hose","unknown"],"confidence":1.4}\n```',
    );
    expect(r).toEqual({
      ok: true,
      reading: { brand: 'Goodman', model: undefined, errorCode: 'EE2', likelyFault: 'Pressure switch open', partsToBring: ['hose'], confidence: 1 },
    });
  });

  it('rejects text without JSON', () => {
    expect(parseTriage('It looks like a Goodman furnace.').ok).toBe(false);
    expect(parseTriage('{"brand": }').ok).toBe(false);
  });
});

describe('code lookup (same rules as the iPhone)', () => {
  it('normalizes the words models add around a code', () => {
    expect(normalizeCode('Error code: ee 2')).toBe('EE2');
    expect(normalizeCode('Code 31')).toBe('31');
    expect(normalizeCode('E-11')).toBe('E11');
  });

  it('finds exact codes, display look-alikes, and LED flash counts', () => {
    expect(lookupCode('EE2', goodman)).toMatchObject({ kind: 'exact', fault: { code: 'EE2' } });
    expect(lookupCode('EEO', goodman)).toMatchObject({ kind: 'close' }); // O vs 0 on a 7-segment display
    expect(lookupCode('1 flash then 3 flashes', carrier)).toMatchObject({ kind: 'exact', fault: { code: '13' } });
    expect(lookupCode('45', rheem)).toMatchObject({ kind: 'exact', fault: { code: '45' } });
    expect(lookupCode('99', rheem).kind).toBe('none');
  });
});

describe('matching a triage to a published pack', () => {
  it('prefers the model-number pattern, then the brand', () => {
    expect(findPack({ model: 'GMVC960803BN' }, packs)?.packId).toBe(goodman.packId);
    expect(findPack({ model: 'R96VA0702317MSA' }, packs)?.packId).toBe(rheem.packId);
    expect(findPack({ brand: 'Carrier' }, packs)?.packId).toBe(carrier.packId);
    expect(findPack({ brand: 'Lennox' }, packs)).toBeUndefined();
  });

  it('returns the pack fault for a matched code (facts from the pack, not the model)', () => {
    const m = matchTriage(reading({ brand: 'Goodman', errorCode: 'EE2' }), packs);
    expect(m.kind).toBe('matched');
    if (m.kind === 'matched') expect(m.fault.meaning).toMatch(/pressure switch/i);
  });

  it('lists parts from the pack’s own outcomes for a matched code', () => {
    const ee2 = goodman.faultCodes.find((f) => f.code === 'EE2')!;
    const parts = packParts(goodman, ee2);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.some((p) => /pressure switch|hose/i.test(p))).toBe(true);
    expect(parts.some((p) => /igniter/i.test(p))).toBe(false); // a model guessing "ignition" can't add these
    expect(new Set(parts.map((p) => p.toLowerCase())).size).toBe(parts.length); // no duplicates
  });

  it('uses the job equipment when the photo shows no brand', () => {
    expect(matchTriage(reading({ errorCode: '45' }), packs, 'Rheem').kind).toBe('matched');
  });

  it('reports a code the pack does not cover, a missing code, or no pack', () => {
    expect(matchTriage(reading({ brand: 'Goodman', errorCode: 'ZZ9' }), packs).kind).toBe('code_not_in_pack');
    expect(matchTriage(reading({ brand: 'Goodman' }), packs).kind).toBe('no_code');
    expect(matchTriage(reading({ brand: 'Trane', errorCode: '2' }), packs).kind).toBe('no_pack');
  });
});
