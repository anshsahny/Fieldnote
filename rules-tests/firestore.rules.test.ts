// Firestore security rules tests against the local emulator.
// Run: cd rules-tests && npm test   (starts the Firestore emulator via firebase emulators:exec)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, getDocs, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const pack = (overrides: Record<string, unknown> = {}) => ({
  packId: 'acme-test-v1',
  brand: 'Acme',
  family: 'AF96',
  equipmentType: 'gas_furnace',
  displayType: 'led_flash',
  modelPatterns: ['^AF96$'],
  version: 1,
  status: 'published',
  faultCodeCount: 2,
  stepCount: 8,
  sourceRefs: [],
  packJson: '{"schemaVersion":1}',
  publishedBy: 'disp',
  ...overrides,
});

const event = (overrides: Record<string, unknown> = {}) => ({
  feature: 'diagnosis',
  platform: 'ios',
  source: 'ON_DEVICE',
  latencyMs: 640,
  ts: Timestamp.now(),
  promptTokensEst: 900,
  ok: true,
  ...overrides,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fieldnote',
    firestore: { rules: readFileSync(resolve(import.meta.dirname, '..', 'firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/disp'), { orgId: 'demo', role: 'dispatcher' });
    await setDoc(doc(db, 'users/tech'), { orgId: 'demo', role: 'tech' });
    await setDoc(doc(db, 'users/outsider'), { orgId: 'other', role: 'dispatcher' });
    await setDoc(doc(db, 'orgs/demo/fixpacks/acme-test-v1'), pack());
    await setDoc(doc(db, 'orgs/demo/jobs/j1'), {
      status: 'assigned',
      assignedTo: 'tech',
      customer: { name: 'Demo', address: '1 Example St' },
    });
    await setDoc(doc(db, 'users/tech2'), { orgId: 'demo', role: 'tech' });
    await setDoc(doc(db, 'orgs/demo/jobs/j2'), {
      status: 'assigned',
      assignedTo: 'tech2',
      customer: { name: 'Other', address: '2 Example St' },
    });
  });
});

const session = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: 's1',
  jobId: 'j1',
  techUid: 'tech',
  packId: 'goodman-cvc96-mvc96-v1',
  packVersion: 2,
  faultCode: 'EE0',
  status: 'active',
  stepId: 'CEE0-S2',
  history: [{ stepId: 'CEE0-S1', instruction: 'Check gas supply.', answer: 'gas supply ok', via: 'note', input: 'meter on' }],
  acknowledgedStops: [],
  createdOffline: true,
  startedAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  ...overrides,
});

const report = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: 'r1',
  jobId: 'j1',
  sessionId: 's1',
  techUid: 'tech',
  facts: { equipment: 'Goodman GMVC96', fault: 'EE0', steps: ['Check gas supply: gas supply ok'] },
  versions: [{ generatedBy: 'ON_DEVICE', kind: 'draft', summary: 'Flue was blocked; cleared it.' }],
  status: 'draft',
  generatedBy: 'ON_DEVICE',
  createdOffline: true,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  ...overrides,
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('fix packs', () => {
  it('a tech cannot publish', async () => {
    await assertFails(setDoc(doc(as('tech'), 'orgs/demo/fixpacks/new-pack-v1'), pack({ packId: 'new-pack-v1', publishedBy: 'tech' })));
  });

  it('a dispatcher can publish a valid pack', async () => {
    await assertSucceeds(setDoc(doc(as('disp'), 'orgs/demo/fixpacks/new-pack-v1'), pack({ packId: 'new-pack-v1' })));
  });

  it('rejects a mismatched packId, oversized JSON, or someone else as publisher', async () => {
    const db = as('disp');
    await assertFails(setDoc(doc(db, 'orgs/demo/fixpacks/new-pack-v1'), pack({ packId: 'other-id' })));
    await assertFails(setDoc(doc(db, 'orgs/demo/fixpacks/new-pack-v1'), pack({ packId: 'new-pack-v1', packJson: 'x'.repeat(26001) })));
    await assertFails(setDoc(doc(db, 'orgs/demo/fixpacks/new-pack-v1'), pack({ packId: 'new-pack-v1', publishedBy: 'tech' })));
  });

  it('versions only go up', async () => {
    const db = as('disp');
    await assertFails(setDoc(doc(db, 'orgs/demo/fixpacks/acme-test-v1'), pack({ version: 1 })));
    await assertSucceeds(setDoc(doc(db, 'orgs/demo/fixpacks/acme-test-v1'), pack({ version: 2 })));
  });

  it('everyone in the org can read packs; other orgs cannot', async () => {
    await assertSucceeds(getDoc(doc(as('tech'), 'orgs/demo/fixpacks/acme-test-v1')));
    await assertFails(getDoc(doc(as('outsider'), 'orgs/demo/fixpacks/acme-test-v1')));
    await assertFails(getDocs(collection(as('outsider'), 'orgs/demo/fixpacks')));
  });
});

describe('org isolation and profiles', () => {
  it('denies cross-org reads of jobs', async () => {
    await assertFails(getDoc(doc(as('outsider'), 'orgs/demo/jobs/j1')));
  });

  it('denies unauthenticated access', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'orgs/demo/fixpacks/acme-test-v1')));
  });

  it('users cannot change their own role or org', async () => {
    await assertSucceeds(getDoc(doc(as('tech'), 'users/tech')));
    await assertFails(updateDoc(doc(as('tech'), 'users/tech'), { role: 'dispatcher' }));
    await assertFails(getDoc(doc(as('tech'), 'users/disp')));
  });
});

describe('jobs', () => {
  it('a tech can update progress fields only', async () => {
    const db = as('tech');
    await assertSucceeds(updateDoc(doc(db, 'orgs/demo/jobs/j1'), { status: 'in_progress', updatedAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(db, 'orgs/demo/jobs/j1'), { assignedTo: 'someone-else' }));
    await assertFails(updateDoc(doc(db, 'orgs/demo/jobs/j1'), { 'customer.address': 'elsewhere' }));
  });

  it('a dispatcher can reassign', async () => {
    await assertSucceeds(updateDoc(doc(as('disp'), 'orgs/demo/jobs/j1'), { assignedTo: 'disp' }));
  });

  it("a tech cannot update someone else's job or set an unknown status", async () => {
    await assertFails(updateDoc(doc(as('tech'), 'orgs/demo/jobs/j2'), { status: 'done' }));
    await assertFails(updateDoc(doc(as('tech'), 'orgs/demo/jobs/j1'), { status: 'paid' }));
  });
});

describe('diagnosis sessions', () => {
  const path = 'orgs/demo/jobs/j1/sessions/s1';

  it('the assigned tech writes and updates a valid session; the org reads it', async () => {
    await assertSucceeds(setDoc(doc(as('tech'), path), session()));
    await assertSucceeds(setDoc(doc(as('tech'), path), session({ status: 'concluded', stepId: 'CEE0-L5' })));
    await assertSucceeds(getDoc(doc(as('disp'), path)));
  });

  it("rejects other techs, spoofed owners, extra fields, and someone else's job", async () => {
    await assertFails(setDoc(doc(as('tech2'), path), session({ techUid: 'tech2' })));
    await assertFails(setDoc(doc(as('tech'), path), session({ techUid: 'tech2' })));
    await assertFails(setDoc(doc(as('tech'), path), session({ customerAddress: '1 Example St' })));
    await assertFails(setDoc(doc(as('tech'), 'orgs/demo/jobs/j2/sessions/s1'), session({ jobId: 'j2' })));
    await assertFails(setDoc(doc(as('tech'), path), session({ id: 'different' })));
  });

  it('rejects bad status and oversized history', async () => {
    await assertFails(setDoc(doc(as('tech'), path), session({ status: 'paused' })));
    await assertFails(setDoc(doc(as('tech'), path), session({ history: Array(61).fill({ answer: 'x' }) })));
  });
});

describe('customer reports', () => {
  const path = 'orgs/demo/reports/r1';

  it('the assigned tech writes a draft, then upgrades it; dispatchers read it', async () => {
    await assertSucceeds(setDoc(doc(as('tech'), path), report()));
    const upgraded = report({
      status: 'final',
      generatedBy: 'IN_CLOUD',
      upgradedAt: Timestamp.now(),
      versions: [
        { generatedBy: 'ON_DEVICE', kind: 'draft', summary: 'Draft.' },
        { generatedBy: 'IN_CLOUD', kind: 'full', summary: 'Full report.' },
      ],
    });
    await assertSucceeds(setDoc(doc(as('tech'), path), upgraded));
    await assertSucceeds(getDoc(doc(as('disp'), path)));
  });

  it("rejects unassigned jobs, other techs' edits, moving jobs, and bad fields", async () => {
    await assertFails(setDoc(doc(as('tech'), path), report({ jobId: 'j2' })));
    await assertSucceeds(setDoc(doc(as('tech'), path), report()));
    await assertFails(setDoc(doc(as('tech2'), path), report({ techUid: 'tech2' })));
    await assertFails(setDoc(doc(as('tech'), path), report({ jobId: 'j2' })));
    await assertFails(setDoc(doc(as('tech'), path), report({ status: 'sent' })));
    await assertFails(setDoc(doc(as('tech'), path), report({ generatedBy: 'GPT' })));
    await assertFails(setDoc(doc(as('tech'), path), report({ customerPhone: '555-0100' })));
    await assertFails(setDoc(doc(as('tech'), path), report({ versions: [] })));
  });
});

describe('hybrid ledger (inferenceEvents)', () => {
  it('org members append typed metadata rows', async () => {
    await assertSucceeds(addDoc(collection(as('tech'), 'orgs/demo/inferenceEvents'), event()));
  });

  it('rejects content fields, bad types, and unknown sources', async () => {
    const col = collection(as('tech'), 'orgs/demo/inferenceEvents');
    await assertFails(addDoc(col, event({ prompt: 'the tech said the burner smells' })));
    await assertFails(addDoc(col, event({ latencyMs: 'fast' })));
    await assertFails(addDoc(col, event({ source: 'SOMEWHERE' })));
    await assertFails(addDoc(col, event({ platform: 'android' })));
  });

  it('only dispatchers read the ledger, and nobody edits it', async () => {
    const ref = await addDoc(collection(as('tech'), 'orgs/demo/inferenceEvents'), event());
    await assertFails(getDoc(doc(as('tech'), ref.path)));
    await assertSucceeds(getDoc(doc(as('disp'), ref.path)));
    await assertFails(updateDoc(doc(as('disp'), ref.path), { ok: false }));
  });
});
