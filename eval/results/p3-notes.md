# P3 note samples — results

Scenario files (bundled into Debug builds):
- `eval/scenarios/p3-notes.json`: 10 notes, 7 clear and 3 hedged.
- `eval/scenarios/p3-walkthrough.json`: the 12 notes from the iPhone walkthrough (Goodman EE0,
  Rheem 11, Carrier 13), each with its flow's earlier answers as history.

A note "asks" when the app's rule (`DiagnosisEngine.clarification`) says so: model answer
`unclear`, confidence < threshold (0.7), or a hedged note ("might", "not sure", …). Asking on a
hedged note is the correct outcome. Every request is about 520 tokens (budget 3,000).

Runner: Debug build, `-FNRunEval <file> -FNEvalRoute <route>`, or Diagnostics sheet → Note eval.

## iPhone, on-device (2026-11-21, prompt v2, before the fixes below)

| Set | Correct | Hedged notes asked | Median latency |
|---|---|---|---|
| p3-notes | 9/10 | 3/3 | **0.67 s** |

Walkthrough by hand in airplane mode: Rheem 11 perfect. Goodman EE0 concluded early: "sensor rod is
shiny, no coating" was read as "oxidized". Carrier 13 stalled on "blower wheel wobbles on the shaft".

## Fixes from the iPhone run

- Carrier stall: the on-device model answered "loose" for the option "loose or defective"; the
  validator only took exact matches and fell back to "pick an answer", and that prompt sat off-screen
  behind the keyboard. The validator now accepts a shortened answer only when all its words belong
  to exactly one option (iOS and web, same table of tests). The keyboard drops and the step scrolls
  into view when the app asks.
- Goodman misread: not reproducible on the Simulator (clean, 1.00, with and without history). Added
  Undo (toolbar, AI turn, and conclusion card, which now shows how the last note was read) and a
  negation rule in prompt v3.
- Hedging moved into code: prompt v3 made one hedged note ("vent might be ok") advance on-device,
  so hedge words now always ask, whatever the model's confidence.

## iOS Simulator (Mac hardware), prompt v3 + fixes, 2 runs each

| Route | p3-notes | Hedged asked | p3-walkthrough | Median latency |
|---|---|---|---|---|
| on-device (Apple Foundation Models) | 9/10 | 3/3 | 12/12 | 1.15 s |
| cloud (gemini-3.5-flash-lite) | 10/10 | 3/3 | 12/12 | 0.87 s |

Remaining on-device miss: n06 "handle was perpendicular to the pipe" asks instead of answering
"valve off" (needs trade knowledge; a safe miss, since the tech taps the answer).

## iPhone, on-device, prompt v3 + fixes (2026-11-21, airplane mode)

| Set | Correct | Hedged notes asked | Clarify rate | Median latency |
|---|---|---|---|---|
| p3-notes | 9/10 | 3/3 | 4/10 | **0.69 s** |
| p3-walkthrough | 12/12 | — | 0/12 | **0.74 s** |

All 22 notes ran on-device. Miss: n06 (asks; safe). Walkthrough by hand: Goodman EE0, Rheem 11 and
Carrier 13 all reached their conclusions. Ledger for both airplane-mode walkthroughs: 24 on-device
diagnosis turns, median 1.1 s (slowest 15 s, first call after launch), 0 failures; 2 safety stops,
0 ms, no model call.
