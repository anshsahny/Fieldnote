import { describe, expect, it } from 'vitest';
import { cloudCost, latestRuns, measured, OUTPUT_TOKENS_PER_CALL, report, resultsTable } from './report';
import type { EvalRun, TurnResult } from './summary';

const pricing = { inputPerMTok: 0.3, outputPerMTok: 2.5, source: 'test' };
const turn = (over: Partial<TurnResult>): TurnResult => ({
  scenario: 's1', kind: 'flow', turn: 1, expect: 'a', outcome: 'a', ok: true, modelCalled: true, ...over,
});
const run = (over: Partial<EvalRun>): EvalRun => ({
  platform: 'ios', route: 'only_on_device', device: 'iPhone (iOS 27.2)', startedAt: '2026-11-24T10:00:00Z',
  promptVersion: 3, threshold: 0.7, cloudModel: 'm', turns: [], ...over,
});

describe('eval report', () => {
  it('keeps the newest run per platform, route and device kind, iPhone first', () => {
    const runs = [
      run({ platform: 'web', route: 'only_in_cloud', device: 'Chrome 143' }),
      run({ startedAt: '2026-11-24T09:00:00Z' }),
      run({ startedAt: '2026-11-24T11:00:00Z', promptVersion: 4 }),
      run({ device: 'iPhone 17 Simulator (iOS 27.2)' }),
    ];
    const latest = latestRuns(runs);
    expect(latest.map((r) => `${r.platform}:${r.device.includes('Simulator') ? 'sim' : 'dev'}:${r.promptVersion}`)).toEqual([
      'ios:dev:4', 'ios:sim:3', 'web:dev:3',
    ]);
  });

  it('prices only cloud-served turns', () => {
    const r = run({
      route: 'only_in_cloud',
      turns: [turn({ source: 'IN_CLOUD', tokens: 1_000 }), turn({ source: 'ON_DEVICE', tokens: 1_000 }), turn({ modelCalled: false })],
    });
    expect(cloudCost(r, pricing)).toBeCloseTo((1_000 * 0.3 + OUTPUT_TOKENS_PER_CALL * 2.5) / 1e6, 10);
    expect(cloudCost(run({ turns: [turn({ source: 'ON_DEVICE', tokens: 500 })] }), pricing)).toBe(0);
  });

  it('renders a row per run and lists misses', () => {
    const r = run({
      turns: [
        turn({ latencyMs: 900, source: 'ON_DEVICE' }),
        turn({ turn: 2, expect: 'clarify', outcome: 'clarify', latencyMs: 1_100, source: 'ON_DEVICE' }),
        turn({ turn: 3, expect: 'safety:GAS', outcome: 'safety:GAS', modelCalled: false }),
        turn({ scenario: 's2', expect: 'b', outcome: 'a', ok: false, confidence: 0.75, latencyMs: 1_000, source: 'ON_DEVICE' }),
      ],
    });
    const table = resultsTable([r], pricing);
    expect(table).toContain('| iPhone · On-device | 1/2 (50%) | **1** | 0 | 0 | 1/1 (100%) | 1/1, 0 model calls | 1/2 | 1.00 s | $0 |');
    const md = report([r], pricing);
    expect(md).toContain('- s2 turn 1 (flow): expected `b`, got `a` at 0.75');
  });

  it('lists real-device runs for the console, without the Simulator', () => {
    const rows = measured([
      run({ turns: [turn({}), turn({ kind: 'safety', expect: 'safety:GAS', outcome: 'safety:GAS', modelCalled: false })] }),
      run({ device: 'iPhone 17 Simulator (iOS 27.2)' }),
      run({ platform: 'web', route: 'only_in_cloud', device: 'Chrome 158', turns: [turn({ ok: false, outcome: 'b' })] }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['iPhone · On-device', 'Chrome · Cloud']);
    expect(rows[0]).toMatchObject({ onDevice: true, right: '1/1', safety: '1/1', date: '2026-11-24' });
    expect(rows[1]).toMatchObject({ onDevice: false, right: '0/1', wrong: 1 });
  });
});
