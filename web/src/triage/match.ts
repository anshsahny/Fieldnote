import type { FaultCode, FixPack } from '../fixpack/schema';

/**
 * Photo pre-triage: the model reads the photo; code checks what it read against the published
 * fix packs. Facts shown to the dispatcher (code meaning, causes, manual pages) come from the pack.
 * Lookup rules mirror ios/Fieldnote/Core/FaultCodeLookup.swift.
 */

export interface TriageReading {
  brand?: string;
  model?: string;
  errorCode?: string;
  likelyFault: string;
  partsToBring: string[];
  confidence: number;
}

export type TriageParse = { ok: true; reading: TriageReading } | { ok: false; error: string };

const UNKNOWN = /^(unknown|n\/?a|none|not visible|unclear|-)?$/i;

function clean(v: unknown, max = 120): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return UNKNOWN.test(t) ? undefined : t.slice(0, max);
}

/** Validates the model's JSON (structured output on both paths, but checked in code anyway). */
export function parseTriage(text: string): TriageParse {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'The model did not return JSON.' };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'The model returned malformed JSON.' };
  }
  const likelyFault = clean(raw.likelyFault, 300);
  const confidence = typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence);
  return {
    ok: true,
    reading: {
      brand: clean(raw.brand, 80),
      model: clean(raw.model, 80),
      errorCode: clean(raw.errorCode, 32),
      likelyFault: likelyFault ?? 'Not enough in the photo to tell',
      partsToBring: Array.isArray(raw.partsToBring)
        ? raw.partsToBring.map((p) => clean(p, 80)).filter((p): p is string => !!p).slice(0, 10)
        : [],
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    },
  };
}

/** "Code 31" → "31", "ee 2" → "EE2", "E-11" → "E11". Words a model adds around a code are dropped. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/\b(ERROR|FAULT|CODE|LED|STATUS|FLASH(ES|ING)?|DISPLAY(S|ED)?|SHOWS?)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

const LOOKALIKES: Record<string, string> = { '6': 'B', B: '6', '0': 'O', O: '0', '5': 'S', S: '5', '1': 'I', I: '1' };

function glyphVariants(key: string): Set<string> {
  const out = new Set<string>();
  [...key].forEach((c, i) => {
    const swap = LOOKALIKES[c];
    if (swap) out.add(key.slice(0, i) + swap + key.slice(i + 1));
  });
  return out;
}

export function editDistance(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export type CodeLookup = { kind: 'exact'; fault: FaultCode } | { kind: 'close'; faults: FaultCode[] } | { kind: 'none' };

export function lookupCode(input: string, pack: FixPack): CodeLookup {
  const key = normalizeCode(input);
  if (!key) return { kind: 'none' };
  const exact = pack.faultCodes.find((fc) => normalizeCode(fc.code) === key || normalizeCode(fc.display) === key);
  if (exact) return { kind: 'exact', fault: exact };
  // Numeric packs (LED flash counts, two-digit displays): "1 flash then 3 flashes" → "13".
  if (pack.faultCodes.every((fc) => /^\d+$/.test(fc.code))) {
    const digits = key.replace(/\D/g, '');
    const byDigits = digits && pack.faultCodes.find((fc) => fc.code === digits);
    if (byDigits) return { kind: 'exact', fault: byDigits };
  }
  const variants = glyphVariants(key);
  const close = pack.faultCodes.filter((fc) => {
    const code = normalizeCode(fc.code);
    return variants.has(code) || editDistance(code, key) === 1;
  });
  return close.length ? { kind: 'close', faults: close } : { kind: 'none' };
}

/** Which published pack covers this equipment: model pattern first, then brand. */
export function findPack(reading: Pick<TriageReading, 'brand' | 'model'>, packs: FixPack[]): FixPack | undefined {
  if (reading.model) {
    const candidates = [reading.model, reading.model.replace(/O/gi, '0')];
    const byModel = packs.find((p) =>
      p.modelPatterns.some((pattern) => {
        try {
          const re = new RegExp(pattern, 'i');
          return candidates.some((m) => re.test(m));
        } catch {
          return false;
        }
      }),
    );
    if (byModel) return byModel;
  }
  if (reading.brand) {
    const b = reading.brand.toLowerCase();
    return packs.find((p) => p.brand.toLowerCase() === b || b.includes(p.brand.toLowerCase()));
  }
  return undefined;
}

/**
 * Parts named anywhere in a fault's step tree (every outcome reachable from its first step).
 * When a code matches, this replaces the model's suggested parts: facts come from the pack.
 */
export function packParts(pack: FixPack, fault: FaultCode): string[] {
  const seen = new Set<string>();
  const parts: string[] = [];
  const stack = [fault.firstStep];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const step = pack.steps[id];
    if (!step) continue;
    for (const part of step.outcome?.parts ?? []) {
      const key = part.trim().toLowerCase();
      if (key && !parts.some((p) => p.toLowerCase() === key)) parts.push(part.trim());
    }
    for (const next of Object.values(step.next ?? {})) stack.push(next);
  }
  return parts;
}

export type PackMatch =
  | { kind: 'matched'; pack: FixPack; fault: FaultCode }
  | { kind: 'close'; pack: FixPack; faults: FaultCode[] }
  | { kind: 'code_not_in_pack'; pack: FixPack }
  | { kind: 'no_code'; pack: FixPack }
  | { kind: 'no_pack' };

export function matchTriage(reading: TriageReading, packs: FixPack[], fallbackBrand?: string): PackMatch {
  const pack = findPack(reading, packs) ?? (fallbackBrand ? findPack({ brand: fallbackBrand }, packs) : undefined);
  if (!pack) return { kind: 'no_pack' };
  if (!reading.errorCode) return { kind: 'no_code', pack };
  const hit = lookupCode(reading.errorCode, pack);
  if (hit.kind === 'exact') return { kind: 'matched', pack, fault: hit.fault };
  if (hit.kind === 'close') return { kind: 'close', pack, faults: hit.faults };
  return { kind: 'code_not_in_pack', pack };
}
