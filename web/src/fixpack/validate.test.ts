import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixPackJsonSchema, MAX_PACK_BYTES, UNIVERSAL_SAFETY_IDS } from './schema';
import { serializeFixPack, validateFixPackJson } from './validate';

// Vitest runs from web/; the shared fixtures live at the repo root.
const root = resolve(process.cwd(), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

interface ManifestEntry {
  file: string;
  valid: boolean;
  errors: string[];
}
const manifest = JSON.parse(read('shared/fixtures/fixpacks/manifest.json')) as ManifestEntry[];

describe('fix pack validator: shared fixtures (same manifest as iOS)', () => {
  it.each(manifest.map((m) => [m.file, m] as const))('%s', (_, entry) => {
    const result = validateFixPackJson(read(`shared/fixtures/fixpacks/${entry.file}`));
    if (entry.valid) {
      expect(result.ok, JSON.stringify(!result.ok && result.issues)).toBe(true);
    } else {
      expect(result.ok).toBe(false);
      if (!result.ok) expect([...new Set(result.issues.map((i) => i.code))].sort()).toEqual([...entry.errors].sort());
    }
  });

  it('covers every error code at least once', () => {
    const covered = new Set(manifest.flatMap((m) => m.errors));
    for (const code of [
      'E_JSON', 'E_PACK_SIZE', 'E_SCHEMA', 'E_STRING_LENGTH', 'E_DUPLICATE_CODE', 'E_SOURCE_REF', 'E_MODEL_PATTERN',
      'E_FIRST_STEP', 'E_STEP_SHAPE', 'E_ASK_NEXT_MISMATCH', 'E_NEXT_TARGET', 'E_ORPHAN_STEP', 'E_CYCLE',
      'E_SAFETY_MISSING', 'E_SAFETY_REF',
    ]) {
      expect(covered, code).toContain(code);
    }
  });

  it('reports readable paths', () => {
    const r = validateFixPackJson(read('shared/fixtures/fixpacks/invalid/next-target.json'));
    expect(!r.ok && r.issues[0]).toMatchObject({ code: 'E_NEXT_TARGET', path: 'steps.C3-1.next.runs' });
  });
});

describe('published packs in content/fixpacks/', () => {
  const dir = join(root, 'content/fixpacks');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) it.skip('no packs committed yet', () => {});
  else it.each(files)('%s passes the validator and is canonical JSON', (file) => {
    const text = readFileSync(join(dir, file), 'utf8');
    const r = validateFixPackJson(text);
    expect(r.ok, JSON.stringify(!r.ok && r.issues.slice(0, 5))).toBe(true);
    if (r.ok) {
      expect(r.bytes).toBeLessThanOrEqual(MAX_PACK_BYTES);
      expect(text).toBe(serializeFixPack(r.pack));
      expect(r.pack.faultCodes.length).toBeGreaterThanOrEqual(6);
      expect(`${r.pack.packId}.json`).toBe(file);
    }
  });
});

describe('schema artifacts', () => {
  it('shared/fixpack.schema.json matches the zod schema (run npm run schema:write)', () => {
    expect(JSON.parse(read('shared/fixpack.schema.json'))).toEqual(fixPackJsonSchema());
  });

  it('loads the six universal safety stops', () => {
    expect(UNIVERSAL_SAFETY_IDS).toEqual(['GAS', 'CO', 'BURNING', 'WATER_ELECTRICAL', 'EXPOSED_WIRING', 'FLAME_ROLLOUT']);
  });
});
