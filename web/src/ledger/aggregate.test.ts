import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { LedgerRow } from '../data/types';
import { callCost, median, quantile, summarize } from './aggregate';

const NOW = new Date(2026, 10, 22, 15, 0);
const pricing = { inputPerMTok: 0.3, outputPerMTok: 2.5 };
let n = 0;
function row(p: Partial<LedgerRow> & Pick<LedgerRow, 'feature' | 'source'>, hoursAgo = 1): LedgerRow {
  return {
    id: `r${n++}`,
    platform: 'ios',
    latencyMs: 1000,
    ok: true,
    ts: Timestamp.fromDate(new Date(NOW.getTime() - hoursAgo * 3_600_000)),
    ...p,
  };
}

describe('median / quantile', () => {
  it('handles empty, odd and even inputs', () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(3); // (2+3)/2 rounded
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });
});

describe('callCost', () => {
  it('prices prompt tokens as input and the assumed output by feature', () => {
    // 520 in × $0.30 + 80 out × $2.50 per 1M
    expect(callCost({ feature: 'diagnosis', promptTokensEst: 520 }, pricing)).toBeCloseTo((520 * 0.3 + 80 * 2.5) / 1e6, 12);
    // Unknown prompt size falls back to 500; unknown feature to 150 output tokens.
    expect(callCost({ feature: 'mystery' }, pricing)).toBeCloseTo((500 * 0.3 + 150 * 2.5) / 1e6, 12);
  });
});

describe('summarize', () => {
  const rows: LedgerRow[] = [
    row({ feature: 'diagnosis', source: 'ON_DEVICE', latencyMs: 600, promptTokensEst: 520 }),
    row({ feature: 'diagnosis', source: 'ON_DEVICE', latencyMs: 800, promptTokensEst: 520 }),
    row({ feature: 'diagnosis', source: 'IN_CLOUD', latencyMs: 1800, promptTokensEst: 520 }, 30),
    row({ feature: 'report', source: 'IN_CLOUD', latencyMs: 2800, promptTokensEst: 900 }),
    row({ feature: 'triage', source: 'ON_DEVICE', latencyMs: 1500, platform: 'web' }, 50),
    row({ feature: 'report', source: 'NONE', latencyMs: 0, ok: false }),
    row({ feature: 'safety_stop', source: 'NONE', latencyMs: 0 }),
    row({ feature: 'diagnosis', source: 'ON_DEVICE', latencyMs: 900 }, 24 * 20), // outside a 7-day window
  ];

  it('counts successful AI calls by source and the on-device share', () => {
    const s = summarize(rows, pricing, 7, NOW);
    expect(s.aiCalls).toBe(6);
    expect(s.onDevice).toBe(4);
    expect(s.cloud).toBe(2);
    expect(s.onDeviceShare).toBeCloseTo(4 / 6);
    expect(s.failed).toBe(1);
    expect(s.safetyStops).toBe(1);
    expect(s.byPlatform).toEqual({ ios: 7, web: 1 });
  });

  it('medians latency per source and per feature', () => {
    const s = summarize(rows, pricing, 7, NOW);
    expect(s.medianMs).toEqual({ onDevice: 850, cloud: 2300 });
    const diag = s.byFeature.find((f) => f.feature === 'diagnosis')!;
    expect(diag).toMatchObject({ onDevice: 3, cloud: 1, medianOnDeviceMs: 800, medianCloudMs: 1800 });
    expect(s.byFeature[0]!.feature).toBe('diagnosis'); // most calls first
  });

  it('buckets calls into calendar days, including empty days, oldest first', () => {
    const s = summarize(rows, pricing, 7, NOW);
    expect(s.daily).toHaveLength(7);
    expect(s.daily.at(-1)).toMatchObject({ onDevice: 2, cloud: 1 }); // today (1h ago ×3)
    expect(s.daily.at(-2)).toMatchObject({ onDevice: 0, cloud: 1 }); // 30h ago
    expect(s.daily.at(-3)).toMatchObject({ onDevice: 1, cloud: 0 }); // 50h ago
    expect(s.daily.reduce((a, d) => a + d.onDevice + d.cloud, 0)).toBe(5); // the 20-day-old row is outside
  });

  it('cost avoided prices the on-device calls as if they had run in the cloud', () => {
    const s = summarize(rows, pricing, 7, NOW);
    const onDevice = rows.filter((r) => r.source === 'ON_DEVICE');
    const expected = onDevice.reduce((a, r) => a + callCost(r, pricing), 0);
    expect(s.costAvoided).toBeCloseTo(expected, 12);
    expect(s.cloudSpend).toBeGreaterThan(0);
  });

  it('is empty-safe', () => {
    const s = summarize([], pricing, 7, NOW);
    expect(s.aiCalls).toBe(0);
    expect(s.onDeviceShare).toBeUndefined();
    expect(s.costAvoided).toBe(0);
    expect(s.daily).toHaveLength(7);
  });
});
