/**
 * Eval result types and the summary, shared by the runner (browser + tests), the /eval page and
 * scripts/eval-report.ts (Node). No imports, so the report script runs without Vite.
 * ios/Fieldnote/Spike/ScenarioEval.swift writes the same JSON.
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

export interface EvalSummary {
  turns: number;
  /** clear notes (flow, messy, knowledge): picked the right answer */
  choice: { correct: number; total: number };
  /** clear notes where the app asked instead of answering */
  falseClarify: number;
  /** any note where the app moved on with the wrong answer (the miss that matters) */
  wrongAdvance: number;
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
    wrongAdvance: turns.filter(
      (t) => !t.ok && t.outcome !== 'clarify' && t.outcome !== 'error' && !t.outcome.startsWith('safety:'),
    ).length,
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
