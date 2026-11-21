// Pure assembly of compiler outputs into a fix pack. No network; fully unit-tested.
import { z } from 'zod';
import { UNIVERSAL_SAFETY_IDS, UNIVERSAL_SAFETY_STOPS, type FixPack, type Step } from '../schema';
import { validateFixPack, type FixPackIssue } from '../validate';

const SAFETY_ENUM = [...UNIVERSAL_SAFETY_IDS, 'NONE'];

// ---- Model output contracts (also sent to Gemini as response schemas) ----

export const INDEX_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    brand: { type: 'string' },
    family: { type: 'string' },
    equipmentType: { type: 'string', enum: ['gas_furnace', 'heat_pump', 'air_conditioner', 'boiler'] },
    displayType: { type: 'string', enum: ['led_flash', 'seven_segment', 'mixed'] },
    modelPatterns: { type: 'array', items: { type: 'string' } },
    faultCodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          display: { type: 'string' },
          meaning: { type: 'string' },
          pages: { type: 'string' },
        },
        required: ['code', 'display', 'meaning', 'pages'],
      },
    },
  },
  required: ['brand', 'family', 'equipmentType', 'displayType', 'modelPatterns', 'faultCodes'],
} as const;

export const CODE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    likelyCauses: { type: 'array', items: { type: 'string' } },
    firstStep: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          instruction: { type: 'string' },
          pages: { type: 'string' },
          safety: { type: 'string', enum: SAFETY_ENUM },
          ask: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['observation', 'yesno', 'reading'] },
              options: { type: 'array', items: { type: 'string' } },
              unit: { type: 'string' },
            },
            required: ['type', 'options'],
          },
          next: {
            type: 'array',
            items: {
              type: 'object',
              properties: { option: { type: 'string' }, goto: { type: 'string' } },
              required: ['option', 'goto'],
            },
          },
          outcome: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['fix', 'escalate', 'resolved'] },
              summary: { type: 'string' },
              parts: { type: 'array', items: { type: 'string' } },
            },
            required: ['kind', 'summary'],
          },
        },
        required: ['id', 'instruction'],
      },
    },
  },
  required: ['likelyCauses', 'firstStep', 'steps'],
} as const;

const IndexOutput = z.object({
  brand: z.string().min(1),
  family: z.string().min(1),
  equipmentType: z.enum(['gas_furnace', 'heat_pump', 'air_conditioner', 'boiler']),
  displayType: z.enum(['led_flash', 'seven_segment', 'mixed']),
  modelPatterns: z.array(z.string()).min(1),
  faultCodes: z.array(z.object({ code: z.string().min(1), display: z.string(), meaning: z.string(), pages: z.string() })).min(1),
});
export type IndexOutput = z.infer<typeof IndexOutput>;

const CodeOutput = z.object({
  likelyCauses: z.array(z.string().min(1)).min(1),
  firstStep: z.string().min(1),
  steps: z
    .array(
      z.object({
        id: z.string().min(1),
        instruction: z.string().min(1),
        pages: z.string().optional(),
        safety: z.string().optional(),
        ask: z.object({ type: z.enum(['observation', 'yesno', 'reading']), options: z.array(z.string()), unit: z.string().optional() }).optional(),
        next: z.array(z.object({ option: z.string(), goto: z.string() })).optional(),
        outcome: z.object({ kind: z.enum(['fix', 'escalate', 'resolved']), summary: z.string(), parts: z.array(z.string()).optional() }).optional(),
      }),
    )
    .min(1),
});
export type CodeOutput = z.infer<typeof CodeOutput>;

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileError';
  }
}

function parseModelJson<T>(text: string, schema: z.ZodType<T>, what: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CompileError(`${what}: the model did not return valid JSON.`);
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new CompileError(`${what}: unexpected shape (${first.join('; ')}).`);
  }
  return r.data;
}

export const parseIndexOutput = (text: string) => parseModelJson(text, IndexOutput, 'Fault code index');
export const parseCodeOutput = (text: string, code: string) => parseModelJson(text, CodeOutput, `Code ${code}`);

/** "E3" → "E3", "3 flashes" → "3flashes": a safe step-id prefix per fault code. */
export function codePrefix(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
  return `C${clean || 'X'}`;
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Converts one code's model output into pack steps with globally unique ids. */
export function stepsForCode(code: string, out: CodeOutput): { firstStep: string; steps: Record<string, Step> } {
  const prefix = codePrefix(code);
  const map = (id: string) => `${prefix}-${id.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 32);
  const steps: Record<string, Step> = {};
  for (const s of out.steps) {
    const step: Step = { instruction: tidy(s.instruction) };
    if (s.outcome) {
      step.outcome = {
        kind: s.outcome.kind,
        summary: tidy(s.outcome.summary),
        ...(s.outcome.parts?.length ? { parts: s.outcome.parts.map(tidy) } : {}),
      };
    }
    if (s.ask) {
      step.ask = { type: s.ask.type, options: s.ask.options.map(tidy), ...(s.ask.unit ? { unit: tidy(s.ask.unit) } : {}) };
      step.next = Object.fromEntries((s.next ?? []).map((n) => [tidy(n.option), map(n.goto)]));
    }
    if (s.safety && s.safety !== 'NONE') step.safety = s.safety;
    if (s.pages?.trim()) step.pages = tidy(s.pages);
    steps[map(s.id)] = step;
  }
  return { firstStep: map(out.firstStep), steps };
}

export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export interface AssembleInput {
  index: IndexOutput;
  /** Per fault code (by code string) the model's step tree. Codes without one are skipped. */
  codes: Record<string, CodeOutput>;
  source: { title: string; url: string; pages: string };
  version?: number;
}

export function assemblePack(input: AssembleInput): FixPack {
  const { index } = input;
  const steps: Record<string, Step> = {};
  const faultCodes: FixPack['faultCodes'] = [];
  for (const fc of index.faultCodes) {
    const out = input.codes[fc.code];
    if (!out) continue;
    const built = stepsForCode(fc.code, out);
    Object.assign(steps, built.steps);
    faultCodes.push({
      code: tidy(fc.code),
      display: tidy(fc.display),
      meaning: tidy(fc.meaning),
      likelyCauses: out.likelyCauses.map(tidy).slice(0, 8),
      firstStep: built.firstStep,
      sourceRef: 'src1',
      pages: tidy(fc.pages) || input.source.pages,
    });
  }
  return {
    schemaVersion: 1,
    packId: `${slug(`${index.brand} ${index.family}`)}-v1`.replace(/^-/, ''),
    brand: tidy(index.brand),
    family: tidy(index.family),
    equipmentType: index.equipmentType,
    displayType: index.displayType,
    modelPatterns: index.modelPatterns.map((p) => p.trim()),
    version: input.version ?? 1,
    sourceRefs: [{ id: 'src1', title: tidy(input.source.title), url: input.source.url, pages: input.source.pages }],
    faultCodes,
    steps,
    safetyStops: UNIVERSAL_SAFETY_STOPS,
  };
}

/** Validator issues that belong to one fault code's steps (for targeted retries and the review UI). */
export function issuesForCode(pack: FixPack, issues: FixPackIssue[], code: string): FixPackIssue[] {
  const prefix = `steps.${codePrefix(code)}-`;
  const i = pack.faultCodes.findIndex((fc) => fc.code === code);
  return issues.filter((x) => x.path.startsWith(prefix) || (i >= 0 && x.path.startsWith(`faultCodes[${i}]`)));
}

/** Validates one code's tree in isolation (inside a minimal pack) so it can be retried alone. */
export function validateCodeOutput(index: IndexOutput, code: string, out: CodeOutput, source: AssembleInput['source']) {
  const fc = index.faultCodes.find((f) => f.code === code);
  const pack = assemblePack({ index: { ...index, faultCodes: fc ? [fc] : [] }, codes: { [code]: out }, source });
  const result = validateFixPack(pack);
  return result.ok ? [] : result.issues.filter((i) => i.code !== 'E_MODEL_PATTERN');
}
