// Fix pack validator. Same rules and error codes as ios/Fieldnote/FixPack/FixPackValidator.swift,
// checked against the shared fixtures in shared/fixtures/fixpacks/.
import { FixPackSchema, MAX_PACK_BYTES, MAX_STRING, UNIVERSAL_SAFETY_IDS, type FixPack } from './schema';

export type FixPackErrorCode =
  | 'E_JSON'
  | 'E_PACK_SIZE'
  | 'E_SCHEMA'
  | 'E_STRING_LENGTH'
  | 'E_DUPLICATE_CODE'
  | 'E_SOURCE_REF'
  | 'E_MODEL_PATTERN'
  | 'E_FIRST_STEP'
  | 'E_STEP_SHAPE'
  | 'E_ASK_NEXT_MISMATCH'
  | 'E_NEXT_TARGET'
  | 'E_ORPHAN_STEP'
  | 'E_CYCLE'
  | 'E_SAFETY_MISSING'
  | 'E_SAFETY_REF';

export interface FixPackIssue {
  code: FixPackErrorCode;
  /** Dotted path to the problem, e.g. "steps.S3-1.next.runs". */
  path: string;
  message: string;
}

export type FixPackResult = { ok: true; pack: FixPack; bytes: number } | { ok: false; issues: FixPackIssue[]; bytes: number };

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
/** Unicode scalar count, so web and iOS (unicodeScalars.count) measure strings identically. */
const scalarLength = (s: string) => [...s].length;

function walkStrings(value: unknown, path: string, visit: (s: string, path: string) => void) {
  if (typeof value === 'string') visit(value, path);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkStrings(v, path ? `${path}.${k}` : k, visit);
  }
}

const sortIssues = (issues: FixPackIssue[]) =>
  issues.sort((a, b) => (a.code === b.code ? a.path.localeCompare(b.path) : a.code.localeCompare(b.code)));

/** Validates the pack exactly as stored (the JSON text), so size limits match on every platform. */
export function validateFixPackJson(json: string): FixPackResult {
  const bytes = utf8Bytes(json);
  if (bytes > MAX_PACK_BYTES) {
    return { ok: false, bytes, issues: [{ code: 'E_PACK_SIZE', path: '', message: `Pack is ${bytes} bytes; the limit is ${MAX_PACK_BYTES}.` }] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, bytes, issues: [{ code: 'E_JSON', path: '', message: `Not valid JSON: ${(e as Error).message}` }] };
  }
  return validateFixPack(parsed, bytes);
}

export function validateFixPack(value: unknown, bytes = utf8Bytes(JSON.stringify(value))): FixPackResult {
  const shape = FixPackSchema.safeParse(value);
  if (!shape.success) {
    const issues = shape.error.issues.map<FixPackIssue>((i) => ({
      code: 'E_SCHEMA',
      path: i.path.map(String).join('.'),
      message: i.message,
    }));
    return { ok: false, bytes, issues: sortIssues(issues) };
  }
  const pack = shape.data;
  const issues: FixPackIssue[] = [];
  const add = (code: FixPackErrorCode, path: string, message: string) => issues.push({ code, path, message });

  // Strings ≤ 200 characters (URLs excepted).
  walkStrings(pack, '', (s, path) => {
    if (/^sourceRefs\[\d+\]\.url$/.test(path)) return;
    const n = scalarLength(s);
    if (n > MAX_STRING) add('E_STRING_LENGTH', path, `${n} characters; the limit is ${MAX_STRING}.`);
  });

  // Fault codes: unique, source refs resolve, first steps exist.
  const sourceIds = new Set(pack.sourceRefs.map((s) => s.id));
  const seen = new Set<string>();
  pack.faultCodes.forEach((fc, i) => {
    const key = fc.code.trim().toLowerCase();
    if (seen.has(key)) add('E_DUPLICATE_CODE', `faultCodes[${i}].code`, `Fault code "${fc.code}" appears more than once.`);
    seen.add(key);
    if (!sourceIds.has(fc.sourceRef)) add('E_SOURCE_REF', `faultCodes[${i}].sourceRef`, `Unknown source "${fc.sourceRef}".`);
    if (!(fc.firstStep in pack.steps)) add('E_FIRST_STEP', `faultCodes[${i}].firstStep`, `Step "${fc.firstStep}" does not exist.`);
  });

  // Model patterns: anchored, valid regular expressions.
  pack.modelPatterns.forEach((p, i) => {
    let valid = p.startsWith('^') && p.endsWith('$');
    try {
      new RegExp(p);
    } catch {
      valid = false;
    }
    if (!valid) add('E_MODEL_PATTERN', `modelPatterns[${i}]`, `"${p}" must be a valid regex anchored with ^ and $.`);
  });

  // Steps: shape, ask/next agreement, targets, safety references.
  const safetyIds = new Set(pack.safetyStops.map((s) => s.id));
  for (const [id, step] of Object.entries(pack.steps)) {
    const base = `steps.${id}`;
    const isDecision = !!step.ask && !!step.next && !step.outcome;
    const isLeaf = !!step.outcome && !step.ask && !step.next;
    if (!isDecision && !isLeaf) {
      add('E_STEP_SHAPE', base, 'A step needs either ask + next (decision) or outcome (leaf), not both or neither.');
    }
    if (step.ask && step.next) {
      const options = [...step.ask.options].sort();
      const keys = Object.keys(step.next).sort();
      if (options.join('\u0000') !== keys.join('\u0000')) {
        add('E_ASK_NEXT_MISMATCH', `${base}.next`, `Options [${options.join(', ')}] must match next keys [${keys.join(', ')}].`);
      }
    }
    for (const [option, target] of Object.entries(step.next ?? {})) {
      if (!(target in pack.steps)) add('E_NEXT_TARGET', `${base}.next.${option}`, `Step "${target}" does not exist.`);
    }
    if (step.safety && !safetyIds.has(step.safety)) {
      add('E_SAFETY_REF', `${base}.safety`, `Unknown safety stop "${step.safety}".`);
    }
  }

  // Reachability and cycles, walking from every fault code's first step.
  const reachable = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();
  const cycles = new Set<string>();
  const visit = (id: string) => {
    if (!(id in pack.steps)) return;
    reachable.add(id);
    const s = state.get(id);
    if (s === 'done') return;
    if (s === 'visiting') {
      cycles.add(id);
      return;
    }
    state.set(id, 'visiting');
    for (const target of Object.values(pack.steps[id]!.next ?? {})) visit(target);
    state.set(id, 'done');
  };
  pack.faultCodes.forEach((fc) => visit(fc.firstStep));
  for (const id of cycles) add('E_CYCLE', `steps.${id}`, `Step "${id}" is part of a loop; every path must end in an outcome.`);
  for (const id of Object.keys(pack.steps)) {
    if (!reachable.has(id)) add('E_ORPHAN_STEP', `steps.${id}`, `Step "${id}" is not reachable from any fault code.`);
  }

  // Universal safety stops must all be present.
  for (const id of UNIVERSAL_SAFETY_IDS) {
    if (!safetyIds.has(id)) add('E_SAFETY_MISSING', 'safetyStops', `Universal safety stop "${id}" is missing.`);
  }

  return issues.length ? { ok: false, bytes, issues: sortIssues(issues) } : { ok: true, pack, bytes };
}

/** Stable JSON text for storage and for committing to content/fixpacks/. Tab-indented: readable in
 *  diffs while keeping whitespace from eating the 25 KB budget (deeply nested step trees). */
export function serializeFixPack(pack: FixPack): string {
  return `${JSON.stringify(pack, null, '\t')}\n`;
}
