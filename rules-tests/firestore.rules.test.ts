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
  });
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
