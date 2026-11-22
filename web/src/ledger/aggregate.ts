import type { LedgerRow } from '../data/types';
import { toDate } from '../data/types';

/**
 * Hybrid Ledger math (pure; unit-tested). Rows are metadata only: feature, platform, source,
 * latency, prompt-token estimate. "NONE" rows are safety stops (code, no model) and failed calls.
 */

export type AISource = 'ON_DEVICE' | 'IN_CLOUD';

export interface Pricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

/**
 * Typical output size per feature (tokens). Rows only record the prompt estimate, so the
 * estimate assumes these outputs. Shown alongside the formula on /about.
 */
export const ASSUMED_OUTPUT_TOKENS: Record<string, number> = {
  diagnosis: 80,
  nameplate: 60,
  report: 350,
  triage: 200,
  job_summary: 120,
  ledger_insights: 200,
  compile: 2000,
};
const DEFAULT_OUTPUT_TOKENS = 150;
/** Prompt size assumed when a row has no estimate (web rows before P5 didn't record it). */
export const DEFAULT_PROMPT_TOKENS = 500;

export function callCost(row: Pick<LedgerRow, 'feature' | 'promptTokensEst'>, p: Pricing): number {
  const input = row.promptTokensEst ?? DEFAULT_PROMPT_TOKENS;
  const output = ASSUMED_OUTPUT_TOKENS[row.feature] ?? DEFAULT_OUTPUT_TOKENS;
  return (input * p.inputPerMTok + output * p.outputPerMTok) / 1_000_000;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export function quantile(values: number[], q: number): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
}

export interface FeatureRow {
  feature: string;
  onDevice: number;
  cloud: number;
  medianOnDeviceMs?: number;
  medianCloudMs?: number;
}

export interface DayRow {
  /** yyyy-mm-dd in local time */
  day: string;
  label: string;
  onDevice: number;
  cloud: number;
}

export interface LedgerSummary {
  /** Successful AI calls (on-device + cloud). */
  aiCalls: number;
  onDevice: number;
  cloud: number;
  /** On-device share of successful AI calls, 0..1 (undefined with no calls). */
  onDeviceShare?: number;
  failed: number;
  safetyStops: number;
  byPlatform: { ios: number; web: number };
  medianMs: { onDevice?: number; cloud?: number };
  p90Ms: { onDevice?: number; cloud?: number };
  byFeature: FeatureRow[];
  daily: DayRow[];
  /** What the on-device calls would have cost in the cloud. */
  costAvoided: number;
  /** Estimated spend on the cloud calls made. */
  cloudSpend: number;
}

const isAI = (r: LedgerRow): r is LedgerRow & { source: AISource } =>
  (r.source === 'ON_DEVICE' || r.source === 'IN_CLOUD') && r.ok !== false;

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function summarize(rows: LedgerRow[], pricing: Pricing, days: number, now: Date = new Date()): LedgerSummary {
  const ai = rows.filter(isAI);
  const onDeviceRows = ai.filter((r) => r.source === 'ON_DEVICE');
  const cloudRows = ai.filter((r) => r.source === 'IN_CLOUD');

  const features = new Map<string, { on: number[]; cloud: number[] }>();
  for (const r of ai) {
    const f = features.get(r.feature) ?? { on: [], cloud: [] };
    (r.source === 'ON_DEVICE' ? f.on : f.cloud).push(r.latencyMs);
    features.set(r.feature, f);
  }
  const byFeature: FeatureRow[] = [...features.entries()]
    .map(([feature, f]) => ({
      feature,
      onDevice: f.on.length,
      cloud: f.cloud.length,
      medianOnDeviceMs: median(f.on),
      medianCloudMs: median(f.cloud),
    }))
    .sort((a, b) => b.onDevice + b.cloud - (a.onDevice + a.cloud) || a.feature.localeCompare(b.feature));

  // One bucket per calendar day in the window, oldest first, including empty days.
  const daily: DayRow[] = [];
  const index = new Map<string, DayRow>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const row: DayRow = {
      day: dayKey(d),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      onDevice: 0,
      cloud: 0,
    };
    daily.push(row);
    index.set(row.day, row);
  }
  for (const r of ai) {
    const at = toDate(r.ts);
    const bucket = at && index.get(dayKey(at));
    if (!bucket) continue;
    if (r.source === 'ON_DEVICE') bucket.onDevice++;
    else bucket.cloud++;
  }

  const sum = (list: LedgerRow[]) => list.reduce((acc, r) => acc + callCost(r, pricing), 0);

  return {
    aiCalls: ai.length,
    onDevice: onDeviceRows.length,
    cloud: cloudRows.length,
    onDeviceShare: ai.length ? onDeviceRows.length / ai.length : undefined,
    failed: rows.filter((r) => r.ok === false).length,
    safetyStops: rows.filter((r) => r.feature === 'safety_stop').length,
    byPlatform: {
      ios: rows.filter((r) => r.platform === 'ios').length,
      web: rows.filter((r) => r.platform === 'web').length,
    },
    medianMs: { onDevice: median(onDeviceRows.map((r) => r.latencyMs)), cloud: median(cloudRows.map((r) => r.latencyMs)) },
    p90Ms: { onDevice: quantile(onDeviceRows.map((r) => r.latencyMs), 0.9), cloud: quantile(cloudRows.map((r) => r.latencyMs), 0.9) },
    byFeature,
    daily,
    costAvoided: sum(onDeviceRows),
    cloudSpend: sum(cloudRows),
  };
}

export const FEATURE_LABEL: Record<string, string> = {
  diagnosis: 'Diagnosis notes',
  report: 'Customer reports',
  nameplate: 'Nameplate reading',
  nameplate_ocr: 'Nameplate OCR',
  triage: 'Photo triage',
  job_summary: 'Job summaries',
  compile: 'Manual compile',
  ledger_insights: 'Ledger insights',
  safety_stop: 'Safety stops',
  status_check: 'On-device test',
};

export const featureLabel = (f: string) => FEATURE_LABEL[f] ?? f.replace(/_/g, ' ');
