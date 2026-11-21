import type { FixPack } from './schema';

/** Firestore document for orgs/{orgId}/fixpacks/{packId}. The pack itself is stored as its exact
 *  JSON text (packJson) so iOS validates byte-for-byte what the web validated. */
export interface FixPackDocFields {
  packId: string;
  brand: string;
  family: string;
  equipmentType: FixPack['equipmentType'];
  displayType: FixPack['displayType'];
  modelPatterns: string[];
  version: number;
  status: 'published';
  faultCodeCount: number;
  stepCount: number;
  sourceRefs: FixPack['sourceRefs'];
  packJson: string;
  publishedBy: string;
}

export function fixPackDocFields(pack: FixPack, packJson: string, publishedBy: string): FixPackDocFields {
  return {
    packId: pack.packId,
    brand: pack.brand,
    family: pack.family,
    equipmentType: pack.equipmentType,
    displayType: pack.displayType,
    modelPatterns: pack.modelPatterns,
    version: pack.version,
    status: 'published',
    faultCodeCount: pack.faultCodes.length,
    stepCount: Object.keys(pack.steps).length,
    sourceRefs: pack.sourceRefs,
    packJson,
    publishedBy,
  };
}

export const DEMO_ORG_ID = 'demo';
