// Seeds the demo org into Firestore + Auth (idempotent).
//   cd web && npm run seed                       # everything
//   cd web && npm run seed -- --only=packs       # users | jobs | packs (comma-separated)
//   cd web && npm run seed -- --dry-run
// Credentials: Application Default Credentials (gcloud auth application-default login).
// Demo passwords live in the gitignored .local-secrets (generated on first run, never printed).
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { DEMO_ORG_ID, fixPackDocFields } from '../src/fixpack/firestore';
import { validateFixPackJson } from '../src/fixpack/validate';

const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = new Set((args.find((a) => a.startsWith('--only='))?.slice(7) ?? 'users,jobs,packs').split(','));

const projectId = (JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8')) as { projects: { default: string } }).projects.default;
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const auth = getAuth();

const log = (msg: string) => console.log(`${dryRun ? '[dry-run] ' : ''}${msg}`);

// ---------- secrets (passwords never printed) ----------
const secretsPath = join(root, '.local-secrets');
function secret(key: string): string {
  const text = existsSync(secretsPath) ? readFileSync(secretsPath, 'utf8') : '';
  const m = text.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (m) return m[1]!.trim();
  const value = randomBytes(18).toString('base64url');
  if (!dryRun) appendFileSync(secretsPath, `${text.endsWith('\n') || !text ? '' : '\n'}${key}=${value}\n`, { mode: 0o600 });
  log(`generated ${key} in .local-secrets`);
  return value;
}

// ---------- users ----------
const USERS = [
  { key: 'DEMO_DISPATCHER_PASSWORD', email: 'dispatcher@demo.fieldnote.test', role: 'dispatcher', displayName: 'Dana (demo dispatcher)' },
  { key: 'DEMO_TECH_PASSWORD', email: 'tech@demo.fieldnote.test', role: 'tech', displayName: 'Theo (demo technician)' },
] as const;

async function seedUsers(): Promise<Record<string, string>> {
  const uids: Record<string, string> = {};
  await doc(`orgs/${DEMO_ORG_ID}`, { name: 'Fieldnote Demo HVAC (fictional)', createdBy: 'seed' });
  for (const u of USERS) {
    const password = secret(u.key);
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(u.email);
      uid = existing.uid;
      if (!dryRun) await auth.updateUser(uid, { password, displayName: u.displayName, emailVerified: true });
      log(`updated auth user ${u.email}`);
    } catch (e) {
      if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
      if (dryRun) {
        uid = `dry-run-${u.role}`;
      } else {
        uid = (await auth.createUser({ email: u.email, password, displayName: u.displayName, emailVerified: true })).uid;
      }
      log(`created auth user ${u.email}`);
    }
    uids[u.role] = uid;
    await doc(`users/${uid}`, { orgId: DEMO_ORG_ID, role: u.role, displayName: u.displayName, email: u.email, seededBy: 'seed' });
  }
  return uids;
}

// ---------- jobs (fictional customers, 555-01xx numbers) ----------
function at(hoursFromNow: number) {
  return Timestamp.fromMillis(Date.now() + hoursFromNow * 3_600_000);
}

const JOBS = (techUid: string) => [
  {
    id: 'job-1001',
    customer: { name: 'R. Okafor (demo)', phone: '416-555-0142', address: '14 Demo Crescent, Etobicoke, ON (fictional)' },
    equipment: { type: 'gas_furnace', brand: 'Goodman', model: 'GMVC960803BN', serial: '1609123456' },
    reported: 'No heat since this morning. Furnace display shows a code and the inducer seems quiet.',
    priority: 'urgent',
    status: 'assigned',
    assignedTo: techUid,
    scheduledFor: at(1),
  },
  {
    id: 'job-1002',
    customer: { name: 'M. Tremblay (demo)', phone: '416-555-0177', address: '205 Sample Ave, North York, ON (fictional)' },
    equipment: { type: 'gas_furnace', brand: 'Carrier', model: '59SC5B080E17--14', serial: '' },
    reported: 'Furnace short-cycles; the light on the control board blinks a pattern.',
    priority: 'normal',
    status: 'assigned',
    assignedTo: techUid,
    scheduledFor: at(3),
  },
  {
    id: 'job-1003',
    customer: { name: 'S. Nguyen (demo)', phone: '905-555-0110', address: '88 Placeholder Rd, Mississauga, ON (fictional)' },
    equipment: { type: 'gas_furnace', brand: 'Rheem', model: 'R96VA0702317MSA', serial: '' },
    reported: 'Heat comes on then shuts off after a minute. Display shows a two-digit number.',
    priority: 'normal',
    status: 'scheduled',
    assignedTo: techUid,
    scheduledFor: at(5),
  },
  {
    id: 'job-1004',
    customer: { name: 'A. Haddad (demo)', phone: '647-555-0193', address: '3 Example Lane, Scarborough, ON (fictional)' },
    equipment: { type: 'gas_furnace', brand: 'Goodman', model: 'GCVC960603BN', serial: '' },
    reported: 'Annual maintenance; customer mentions a faint burning smell at startup.',
    priority: 'low',
    status: 'scheduled',
    assignedTo: techUid,
    scheduledFor: at(26),
  },
  {
    id: 'job-1005',
    customer: { name: 'K. Patel (demo)', phone: '416-555-0164', address: '501 Test Street, Toronto, ON (fictional)' },
    equipment: { type: 'gas_furnace', brand: 'Unknown', model: '', serial: '' },
    reported: 'Customer sent a photo of the furnace display; no heat upstairs.',
    priority: 'normal',
    status: 'new',
    assignedTo: null,
    scheduledFor: at(28),
  },
];

async function seedJobs(techUid: string) {
  for (const job of JOBS(techUid)) {
    const { id, ...fields } = job;
    await doc(`orgs/${DEMO_ORG_ID}/jobs/${id}`, { ...fields, seededBy: 'seed', updatedAt: FieldValue.serverTimestamp() });
  }
}

// ---------- packs (validated before writing) ----------
async function seedPacks(publisherUid: string) {
  const dir = join(root, 'content', 'fixpacks');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) log('no packs in content/fixpacks yet');
  for (const file of files) {
    const json = readFileSync(join(dir, file), 'utf8');
    const result = validateFixPackJson(json);
    if (!result.ok) throw new Error(`${file} fails validation: ${result.issues.slice(0, 3).map((i) => `${i.code} ${i.path}`).join('; ')}`);
    await doc(`orgs/${DEMO_ORG_ID}/fixpacks/${result.pack.packId}`, {
      ...fixPackDocFields(result.pack, json, publisherUid),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function doc(path: string, data: Record<string, unknown>) {
  log(`set ${path}`);
  if (!dryRun) await db.doc(path).set(data, { merge: true });
}

const uids = only.has('users') ? await seedUsers() : await lookupUids();
if (only.has('jobs')) await seedJobs(uids.tech!);
if (only.has('packs')) await seedPacks(uids.dispatcher!);
log('done');

async function lookupUids(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const u of USERS) out[u.role] = (await auth.getUserByEmail(u.email)).uid;
  return out;
}
