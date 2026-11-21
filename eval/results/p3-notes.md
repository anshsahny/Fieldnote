# P3 note sample — results

Scenario file: `eval/scenarios/p3-notes.json` (10 notes: 7 clear, 3 hedged). Prompt `diagnosis` v2,
confidence threshold 0.7 (Remote Config `diagnosis_confidence_threshold`). A note "asks" when the
model returns `unclear` or confidence < threshold; asking on a hedged note is the correct outcome.

Runner: Debug build, `-FNRunEval p3-notes -FNEvalRoute <route>` or Diagnostics sheet → Note eval.
Every request ≈ 520 tokens (budget 3,000).

## iOS Simulator (Mac hardware), 2026-11-21

| Route | Correct | Clear notes answered | Hedged notes asked | Clarify rate | Median latency |
|---|---|---|---|---|---|
| on-device (Apple Foundation Models) | 9/10 | 6/7 | 3/3 | 4/10 | 1.06 s (first call 3.2 s cold) |
| cloud (gemini-3.5-flash-lite) | 10/10 | 7/7 | 3/3 | 3/10 | 0.99 s |

On-device miss: n06 "handle was perpendicular to the pipe" → asked instead of answering "valve
off" (needs trade knowledge; a safe miss, since the tech just taps the answer).

Tuning made from this run: at threshold 0.6, n09 "vent might be ok" advanced on-device at
confidence 0.60. Clear notes score 0.8–1.0, so the threshold moved to 0.7; n09 now asks.

## iPhone (on-device), airplane mode

_Pending the P3 human check._
