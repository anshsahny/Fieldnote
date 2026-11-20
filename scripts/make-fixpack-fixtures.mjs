#!/usr/bin/env node
// Generates shared/fixtures/fixpacks/invalid/*.json from valid/minimal.json: each fixture breaks
// exactly one validator rule. Both the web (Vitest) and iOS (Swift Testing) suites read
// manifest.json and must report exactly the listed error codes.
// Run from the repo root: node scripts/make-fixpack-fixtures.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = 'shared/fixtures/fixpacks';
const base = JSON.parse(readFileSync(`${dir}/valid/minimal.json`, 'utf8'));
const clone = () => structuredClone(base);
const long = 'x'.repeat(201);

const cases = [
  ['next-target', ['E_NEXT_TARGET'], (p) => { p.steps['C3-1'].next.runs = 'C3-99'; delete p.steps['C3-2']; delete p.steps['C3-4']; delete p.steps['C3-5']; }],
  ['first-step', ['E_FIRST_STEP', 'E_ORPHAN_STEP'], (p) => { p.faultCodes[1].firstStep = 'C4-9'; }],
  ['orphan-step', ['E_ORPHAN_STEP'], (p) => { p.steps['X-1'] = { instruction: 'Unreachable.', outcome: { kind: 'resolved', summary: 'Nothing links here.' } }; }],
  ['cycle', ['E_CYCLE'], (p) => { p.steps['C4-3'] = { instruction: 'Recheck the filter.', ask: { type: 'yesno', options: ['yes', 'no'] }, next: { yes: 'C4-1', no: 'C4-2' } }; }],
  ['ask-next-mismatch', ['E_ASK_NEXT_MISMATCH'], (p) => { p.steps['C4-1'].ask.options = ['dirty', 'clean', 'missing']; }],
  ['step-shape', ['E_STEP_SHAPE'], (p) => { p.steps['C4-2'].ask = { type: 'yesno', options: ['yes', 'no'] }; p.steps['C4-2'].next = { yes: 'C4-3', no: 'C4-3' }; }],
  ['safety-missing', ['E_SAFETY_MISSING'], (p) => { p.safetyStops = p.safetyStops.filter((s) => s.id !== 'CO'); }],
  ['safety-ref', ['E_SAFETY_REF'], (p) => { p.steps['C3-2'].safety = 'ASBESTOS'; }],
  ['string-length', ['E_STRING_LENGTH'], (p) => { p.faultCodes[0].meaning = long; }],
  ['duplicate-code', ['E_DUPLICATE_CODE'], (p) => { p.faultCodes[1].code = '3'; }],
  ['source-ref', ['E_SOURCE_REF'], (p) => { p.faultCodes[0].sourceRef = 'src9'; }],
  ['model-pattern', ['E_MODEL_PATTERN'], (p) => { p.modelPatterns = ['AF96\\d{4}', '^AF96([A-Z$']; }],
  ['schema', ['E_SCHEMA'], (p) => { delete p.faultCodes; }],
  ['pack-size', ['E_PACK_SIZE'], (p) => {
    for (let i = 0; i < 160; i++) p.steps[`P-${i}`] = { instruction: 'Padding step to exceed the 25 KB limit.', outcome: { kind: 'resolved', summary: 'Padding.' } };
  }],
];

mkdirSync(`${dir}/invalid`, { recursive: true });
const manifest = [{ file: 'valid/minimal.json', valid: true, errors: [] }];
for (const [name, errors, mutate] of cases) {
  const p = clone();
  mutate(p);
  writeFileSync(`${dir}/invalid/${name}.json`, `${JSON.stringify(p, null, 2)}\n`);
  manifest.push({ file: `invalid/${name}.json`, valid: false, errors });
}
writeFileSync(`${dir}/invalid/not-json.json`, '{ "schemaVersion": 1, "packId": \n');
manifest.push({ file: 'invalid/not-json.json', valid: false, errors: ['E_JSON'] });
writeFileSync(`${dir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${manifest.length - 1} invalid fixtures + manifest`);
