import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateFixPackJson } from '../fixpack/validate';
import type { FixPack } from '../fixpack/schema';
import { SafetyGuard } from '../diagnosis/rules';
import { endOf, isRateLimit, paced, runScenarios, summarize, walk, type Interpret, type Scenario } from './runner';

const root = join(process.cwd(), '..');
const file = JSON.parse(readFileSync(join(root, 'eval/scenarios/p6-scenarios.json'), 'utf8')) as { scenarios: Scenario[] };
const scenarios = file.scenarios;
const packs = new Map<string, FixPack>(
  ['goodman-cvc96-mvc96-v1', 'carrier-59sc5b-v1', 'rheem-r96v-v1'].map((id) => {
    const r = validateFixPackJson(readFileSync(join(root, `content/fixpacks/${id}.json`), 'utf8'));
    if (!r.ok) throw new Error(id);
    return [id, r.pack];
  }),
);

describe('eval/scenarios/p6-scenarios.json', () => {
  it('has 24 scenarios, 8 per brand, with the planned mix', () => {
    expect(scenarios).toHaveLength(24);
    for (const prefix of ['g', 'c', 'r']) expect(scenarios.filter((s) => s.id.startsWith(prefix))).toHaveLength(8);
    expect(scenarios.filter((s) => s.kind === 'safety')).toHaveLength(4);
    expect(scenarios.flatMap((s) => s.turns).filter((t) => t.expect === 'clarify').length).toBeGreaterThanOrEqual(4);
    expect(scenarios.filter((s) => s.kind === 'messy').length).toBeGreaterThanOrEqual(4);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(24);
  });

  it.each(scenarios.map((s) => [s.id, s] as const))('%s: every expected answer exists and the path ends at the conclusion', (_id, s) => {
    const pack = packs.get(s.packId)!;
    expect(endOf(s, pack)).toBe(s.conclusion);
    expect(pack.steps[s.conclusion]?.outcome).toBeDefined();
  });

  it.each(scenarios.map((s) => [s.id, s] as const))('%s: safety turns trip the guard and other notes do not', (_id, s) => {
    const pack = packs.get(s.packId)!;
    const guard = new SafetyGuard(pack.safetyStops);
    for (const { turn } of walk(s, pack)) {
      const stop = guard.check(turn.note)?.id;
      if (turn.expect.startsWith('safety:')) expect(`safety:${stop}`).toBe(turn.expect);
      else expect(stop, turn.note).toBeUndefined();
    }
  });
});

describe('runScenarios', () => {
  it('a perfect model scores 100% and safety never reaches it', async () => {
    let calls = 0;
    const perfect: Interpret = async (p) => {
      calls++;
      // Answer with the expected choice for the note being asked (found by matching the note).
      const turn = scenarios.flatMap((s) => s.turns).find((t) => p.user.includes(t.note.slice(0, 40)))!;
      const choice = turn.expect === 'clarify' ? (p.allowed[0] ?? 'unclear') : turn.expect;
      return { text: JSON.stringify({ choice, confidence: 0.95, say: 'ok' }), source: 'ON_DEVICE', latencyMs: 500 };
    };
    const turns = await runScenarios(scenarios, packs, perfect, 0.7);
    const s = summarize(turns);
    expect(s.choice.correct).toBe(s.choice.total);
    expect(s.clarify.correct).toBe(s.clarify.total); // hedge words ask, even at 0.95
    expect(s.safety).toEqual({ correct: 4, total: 4, modelCalls: 0 });
    expect(s.scenarios).toEqual({ correct: 24, total: 24 });
    expect(calls).toBe(s.turns - 4);
    expect(s.medianLatencyMs).toBe(500);
  });

  it('counts a model that always says unclear as asking on every clear note', async () => {
    const unsure: Interpret = async () => ({ text: '{"choice":"unclear","confidence":0.2,"say":"?"}', source: 'IN_CLOUD', latencyMs: 900 });
    const s = summarize(await runScenarios(scenarios, packs, unsure, 0.7));
    expect(s.choice.correct).toBe(0);
    expect(s.falseClarify).toBe(s.choice.total);
    expect(s.clarify.correct).toBe(s.clarify.total);
    expect(s.sources).toEqual({ IN_CLOUD: s.turns - 4 });
  });

  it('records errors without stopping the run', async () => {
    const down: Interpret = async () => {
      throw new Error('[429] quota');
    };
    const s = summarize(await runScenarios(scenarios, packs, down, 0.7));
    expect(s.errors).toBe(s.turns - 4);
    expect(s.safety.correct).toBe(4);
  });
});

describe('paced', () => {
  const prompt = { system: 's', user: 'u', allowed: ['a'], tokenEstimate: 1 };
  const ok = { text: '{}', source: 'IN_CLOUD' as const, latencyMs: 1 };

  it('spaces calls and waits out a 429 before retrying', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    };
    let calls = 0;
    const flaky: Interpret = async () => {
      calls++;
      if (calls === 2) throw new Error('[429] You exceeded your current quota');
      return ok;
    };
    const run = paced(flaky, { minIntervalMs: 5_000, retryDelayMs: 20_000 }, sleep, () => clock);
    await run(prompt);
    await run(prompt);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([5_000, 20_000]);
  });

  it('does not retry other errors', async () => {
    const run = paced(async () => { throw new Error('App Check token is invalid'); }, {}, async () => {}, () => 0);
    await expect(run(prompt)).rejects.toThrow('App Check');
    expect(isRateLimit(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isRateLimit(new Error('401 unauthorized'))).toBe(false);
  });
});
