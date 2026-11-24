import { validateDecision } from '../ai/diagnosis';
import type { FixPack, Step } from '../fixpack/schema';
import { buildDiagnosisPrompt, clarificationFor, SafetyGuard, type BuiltPrompt } from '../diagnosis/rules';
import type { Scenario, Turn, TurnResult } from './summary';

export { summarize, type EvalRun, type EvalSummary, type Scenario, type Turn, type TurnResult } from './summary';

/**
 * P6 evaluation runner (platform-neutral). Scores a model on the scenarios in
 * eval/scenarios/p6-scenarios.json with the same rules the iPhone app applies.
 * ios/Fieldnote/Spike/ScenarioEval.swift writes the same result format.
 */

/** One model call: text in, raw text out (the runner validates it like the app does). */
export type Interpret = (prompt: BuiltPrompt) => Promise<{ text: string; source: 'ON_DEVICE' | 'IN_CLOUD' | 'UNKNOWN'; latencyMs: number }>;

export const isRateLimit = (e: unknown) => /\b429\b|resource.?exhausted|quota/i.test(e instanceof Error ? e.message : String(e));

/**
 * Wraps an Interpret so calls start at least `minIntervalMs` apart and a rate-limit error is waited
 * out (up to `retries` times) instead of being scored as a model miss. The Gemini Developer API
 * free tier allows 15 requests a minute, so cloud eval runs use about 13.
 */
export function paced(
  interpret: Interpret,
  { minIntervalMs = 4_600, retries = 3, retryDelayMs = 20_000 } = {},
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = () => Date.now(),
): Interpret {
  let last = -Infinity;
  return async (prompt) => {
    for (let attempt = 0; ; attempt++) {
      const wait = last + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      try {
        return await interpret(prompt);
      } catch (e) {
        if (attempt >= retries || !isRateLimit(e)) throw e;
        await sleep(retryDelayMs);
      }
    }
  };
}

export function stepAt(pack: FixPack, code: string): { firstStep: string } {
  const fault = pack.faultCodes.find((f) => f.code === code);
  if (!fault) throw new Error(`${pack.packId} has no code ${code}`);
  return { firstStep: fault.firstStep };
}

/** Walks a scenario's expected path; yields each turn with the step it is asked at. */
export function* walk(s: Scenario, pack: FixPack): Generator<{ turn: Turn; index: number; stepId: string; step: Step; history: { instruction: string; answer: string }[] }> {
  let stepId = stepAt(pack, s.code).firstStep;
  const history: { instruction: string; answer: string }[] = [];
  for (const [index, turn] of s.turns.entries()) {
    const step = pack.steps[stepId];
    if (!step) throw new Error(`${s.id}: missing step ${stepId}`);
    yield { turn, index, stepId, step, history: [...history] };
    const answer = turn.expect === 'clarify' || turn.expect.startsWith('safety:') ? turn.tap : turn.expect;
    if (answer) {
      const next = step.next?.[answer];
      if (!next) throw new Error(`${s.id} turn ${index + 1}: "${answer}" is not an answer at ${stepId}`);
      history.push({ instruction: step.instruction, answer });
      stepId = next;
    }
  }
  return stepId;
}

/** Where the expected path ends (for validating the scenario file). */
export function endOf(s: Scenario, pack: FixPack): string {
  const it = walk(s, pack);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value as string;
}

export async function runScenarios(
  scenarios: Scenario[],
  packs: Map<string, FixPack>,
  interpret: Interpret,
  threshold: number,
  onTurn?: (r: TurnResult) => void,
): Promise<TurnResult[]> {
  const results: TurnResult[] = [];
  for (const s of scenarios) {
    const pack = packs.get(s.packId);
    if (!pack) throw new Error(`pack ${s.packId} not loaded`);
    const guard = new SafetyGuard(pack.safetyStops);
    for (const { turn, index, step, history } of walk(s, pack)) {
      const base = { scenario: s.id, kind: s.kind, turn: index + 1, expect: turn.expect };
      let r: TurnResult;
      // 1. Safety is code and runs before any model call.
      const stop = guard.check(turn.note);
      if (stop) {
        const outcome = `safety:${stop.id}`;
        r = { ...base, outcome, ok: outcome === turn.expect, modelCalled: false };
      } else {
        const prompt = buildDiagnosisPrompt(step, history, turn.note);
        try {
          const res = await interpret(prompt);
          const v = validateDecision(res.text, prompt.allowed);
          const decision = v.ok ? v.decision : { choice: 'unclear', confidence: 0, say: '' };
          const outcome = clarificationFor(decision, turn.note, threshold) ? 'clarify' : decision.choice;
          r = {
            ...base,
            outcome,
            ok: outcome === turn.expect,
            modelCalled: true,
            source: res.source,
            latencyMs: res.latencyMs,
            tokens: prompt.tokenEstimate,
            confidence: decision.confidence,
            choice: decision.choice,
            ...(v.ok ? {} : { error: v.error }),
          };
        } catch (e) {
          r = { ...base, outcome: 'error', ok: false, modelCalled: true, error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
        }
      }
      results.push(r);
      onTurn?.(r);
    }
  }
  return results;
}
