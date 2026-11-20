// Fix pack data contract (schemaVersion 1). Mirrored by ios/Fieldnote/FixPack/FixPack.swift.
// shared/fixpack.schema.json is generated from this file (npm run schema:write) and a test keeps
// them in sync. Shape lives here; cross-reference rules live in validate.ts.
import { z } from 'zod';
import safetyStopsFile from '../../../shared/safety-stops.json';

export const MAX_STRING = 200;
export const MAX_PACK_BYTES = 25 * 1024;

const Text = z.string().min(1);
export const StepId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, 'step id: 1-32 of A-Z a-z 0-9 _ -');
const SafetyId = z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'safety id: UPPER_SNAKE');

export const SafetyStopSchema = z.object({
  id: SafetyId,
  triggers: z.array(Text).min(1).max(20),
  message: Text,
});

export const AskSchema = z.object({
  type: z.enum(['observation', 'yesno', 'reading']),
  options: z.array(Text).min(2).max(6),
  unit: z.string().optional(),
});

export const OutcomeSchema = z.object({
  kind: z.enum(['fix', 'escalate', 'resolved']),
  summary: Text,
  parts: z.array(Text).max(8).optional(),
});

export const StepSchema = z.object({
  instruction: Text,
  /** Decision step: the tech's answer must be one of ask.options; next maps each option to a step. */
  ask: AskSchema.optional(),
  next: z.record(z.string(), StepId).optional(),
  /** Leaf step: what to do / conclude. Exactly one of (ask + next) or outcome. */
  outcome: OutcomeSchema.optional(),
  /** Safety stop to show before this step (e.g. before opening the gas valve compartment). */
  safety: SafetyId.nullable().optional(),
  pages: z.string().optional(),
});

export const FaultCodeSchema = z.object({
  code: Text,
  display: Text,
  meaning: Text,
  likelyCauses: z.array(Text).min(1).max(8),
  firstStep: StepId,
  sourceRef: Text,
  pages: Text,
});

export const SourceRefSchema = z.object({
  id: Text,
  title: Text,
  url: z.url({ protocol: /^https$/ }),
  pages: Text,
});

export const FixPackSchema = z.object({
  schemaVersion: z.literal(1),
  packId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/, 'packId: lowercase, digits, dashes'),
  brand: Text,
  family: Text,
  equipmentType: z.enum(['gas_furnace', 'heat_pump', 'air_conditioner', 'boiler']),
  displayType: z.enum(['led_flash', 'seven_segment', 'mixed']),
  modelPatterns: z.array(Text).min(1).max(10),
  version: z.number().int().min(1),
  sourceRefs: z.array(SourceRefSchema).min(1).max(5),
  faultCodes: z.array(FaultCodeSchema).min(1).max(40),
  steps: z.record(StepId, StepSchema),
  safetyStops: z.array(SafetyStopSchema).min(1).max(20),
});

export type FixPack = z.infer<typeof FixPackSchema>;
export type Step = z.infer<typeof StepSchema>;
export type FaultCode = z.infer<typeof FaultCodeSchema>;
export type SafetyStop = z.infer<typeof SafetyStopSchema>;

/** The six stops every pack must carry (shared/safety-stops.json). */
export const UNIVERSAL_SAFETY_STOPS: SafetyStop[] = z
  .array(SafetyStopSchema)
  .parse((safetyStopsFile as { safetyStops: unknown }).safetyStops);
export const UNIVERSAL_SAFETY_IDS = UNIVERSAL_SAFETY_STOPS.map((s) => s.id);

/** JSON Schema (draft 2020-12) for documentation and tooling; written to shared/fixpack.schema.json. */
export function fixPackJsonSchema(): Record<string, unknown> {
  return {
    $id: 'https://github.com/anshsahny/Fieldnote/shared/fixpack.schema.json',
    title: 'Fieldnote fix pack (schemaVersion 1)',
    description:
      'Generated from web/src/fixpack/schema.ts. Cross-reference rules (next targets exist, no orphans or cycles, ' +
      'universal safety stops, strings <= 200 chars, pack <= 25 KB) are enforced by the validators on web and iOS.',
    ...z.toJSONSchema(FixPackSchema, { target: 'draft-2020-12' }),
  };
}
