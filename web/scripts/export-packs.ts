// Writes the published packs (orgs/demo/fixpacks/*.packJson) to content/fixpacks/{packId}.json,
// byte-for-byte, after validating them. Run: cd web && npm run packs:export
// Credentials: Application Default Credentials (gcloud auth application-default login).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_ORG_ID } from '../src/fixpack/firestore';
import { validateFixPackJson } from '../src/fixpack/validate';

const root = resolve(import.meta.dirname, '..', '..');
const projectId = (JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8')) as { projects: { default: string } }).projects.default;
initializeApp({ credential: applicationDefault(), projectId });

const snap = await getFirestore().collection(`orgs/${DEMO_ORG_ID}/fixpacks`).get();
for (const doc of snap.docs) {
  const json = doc.get('packJson') as string;
  const result = validateFixPackJson(json);
  if (!result.ok) {
    console.error(`${doc.id}: skipped, fails validation (${result.issues[0]?.code} ${result.issues[0]?.path})`);
    continue;
  }
  writeFileSync(join(root, 'content', 'fixpacks', `${doc.id}.json`), json);
  console.log(`${doc.id}: v${result.pack.version}, ${result.pack.faultCodes.length} codes, ${(result.bytes / 1024).toFixed(1)} KB`);
}
