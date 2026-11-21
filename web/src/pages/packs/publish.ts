import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDb } from '../../firebase/client';
import { fixPackDocFields } from '../../fixpack/firestore';
import type { FixPack } from '../../fixpack/schema';
import { serializeFixPack, validateFixPackJson } from '../../fixpack/validate';

/** Publishes a validated pack as the next version of orgs/{orgId}/fixpacks/{packId}. */
export async function publishPack(orgId: string, uid: string, pack: FixPack): Promise<{ version: number; json: string }> {
  const ref = doc(getDb(), 'orgs', orgId, 'fixpacks', pack.packId);
  const existing = await getDoc(ref);
  const version = ((existing.data()?.version as number | undefined) ?? 0) + 1;
  const json = serializeFixPack({ ...pack, version });
  const check = validateFixPackJson(json);
  if (!check.ok) throw new Error(`Pack no longer validates: ${check.issues[0]?.code} ${check.issues[0]?.path}`);
  await setDoc(ref, { ...fixPackDocFields(check.pack, json, uid), updatedAt: serverTimestamp() });
  return { version, json };
}
