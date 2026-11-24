import { validateDecision } from '../ai/diagnosis';
import type { FixPack, Step } from '../fixpack/schema';
import { buildDiagnosisPrompt, clarificationFor, SafetyGuard, type BuiltPrompt } from '../diagnosis/rules';

/**
 * P6 evaluation runner (platform-neutral). Scores a model on the scenarios in
 * eval/scenarios/p6-scenarios.json with the same rules the iPhone app applies.
 * ios/Fieldnote/Spike/ScenarioEval.swift writes the same result format.
 */

export interface Turn {
  note: string;
  /** an allowed answer, "clarify", or "safety:<ID>" */
  expect: string;
  /** what the tech taps after a clarify or safety turn */
  tap?: string;
}

export interface Scenario {
  id: string;
  packId: string;
  code: string;
  kind: 'flow' | 'messy' | 'ambiguous' | 'safety' | 'knowledge';
  conclusion: string;
  turns: Turn[];
}

export interface TurnResult {
  scenario: string;
  kind: Scenario['kind'];
  turn: number;
  expect: string;
  /** choice, "clarify", "safety:<ID>", or "error" */
  outcome: string;
  ok: boolean;
  modelCalled: boolean;
  source?: 'ON_DEVICE' | 'IN_CLOUD' | 'UNKNOWN';
  latencyMs?: number;
  tokens?: number;
  confidence?: number;
  choice?: string;
  error?: string;
}

export interface EvalRun {
  platform: 'ios' | 'web';
  route: string;
  device: string;
  startedAt: string;
  promptVersion: number;
  threshold: number;
  cloudModel: string;
  turns: TurnResult[];
}

/** One model call: text in, raw text out (the runner validates it like the app does). */
export type Interpret = (prompt: BuiltPrompt) => Promise<{ text: string; source: 'ON_DEVICE' | 'IN_CLOUD' | 'UNKNOWN'; latencyMs: number }>;

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

export interface EvalSummary {
  turns: number;
  /** clear notes (flow, messy, knowledge): picked the right answer */
  choice: { correct: number; total: number };
  /** clear notes where the app asked instead of answering */
  falseClarify: number;
  /** hedged notes where the app asked (the right outcome) */
  clarify: { correct: number; total: number };
  safety: { correct: number; total: number; modelCalls: number };
  /** every turn of the scenario correct */
  scenarios: { correct: number; total: number };
  errors: number;
  medianLatencyMs?: number;
  sources: Record<string, number>;
  promptTokens: number;
}

export function summarize(turns: TurnResult[]): EvalSummary {
  const isChoice = (t: TurnResult) => t.expect !== 'clarify' && !t.expect.startsWith('safety:');
  const choiceTurns = turns.filter(isChoice);
  const clarifyTurns = turns.filter((t) => t.expect === 'clarify');
  const safetyTurns = turns.filter((t) => t.expect.startsWith('safety:'));
  const latencies = turns.filter((t) => t.modelCalled && t.latencyMs !== undefined && t.outcome !== 'error').map((t) => t.latencyMs!);
  const sorted = [...latencies].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const byScenario = new Map<string, boolean>();
  for (const t of turns) byScenario.set(t.scenario, (byScenario.get(t.scenario) ?? true) && t.ok);
  const sources: Record<string, number> = {};
  for (const t of turns) if (t.source) sources[t.source] = (sources[t.source] ?? 0) + 1;
  return {
    turns: turns.length,
    choice: { correct: choiceTurns.filter((t) => t.ok).length, total: choiceTurns.length },
    falseClarify: choiceTurns.filter((t) => t.outcome === 'clarify').length,
    clarify: { correct: clarifyTurns.filter((t) => t.ok).length, total: clarifyTurns.length },
    safety: {
      correct: safetyTurns.filter((t) => t.ok).length,
      total: safetyTurns.length,
      modelCalls: safetyTurns.filter((t) => t.modelCalled).length,
    },
    scenarios: { correct: [...byScenario.values()].filter(Boolean).length, total: byScenario.size },
    errors: turns.filter((t) => t.outcome === 'error').length,
    medianLatencyMs: sorted.length ? (sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)) : undefined,
    sources,
    promptTokens: turns.reduce((a, t) => a + (t.tokens ?? 0), 0),
  };
}
