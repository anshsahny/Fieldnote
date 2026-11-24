## Tuning (one round, Nov 24)

The first runs used diagnosis prompt v3 and confidence threshold 0.7. Cloud models were already
perfect, so tuning targeted the on-device model, then every route was re-run.

| Run (iOS Simulator, on-device) | Turns right | Wrong answer accepted | Asked instead | Model errors |
|---|---|---|---|---|
| Prompt v3, threshold 0.7 | 59/64 | 2 (c04 "inducer hums and won't spin up" → "runs properly" at 0.70; c07 "burner stays lit a second after the valve closes" → "no flame" at 0.75) | 2 | 1 |
| Prompt v4, threshold 0.7 | 60/64 | 1 (g01 "inducer spins up strong and quiet" → "weak or failed" at 0.70) | 2 | 1 |
| Prompt v4, threshold 0.8 | 62/64 | **0** | 2 (c04, r02: the model says "unclear") | 0 |

- **Prompt v4** adds two general reading rules: spoken negations ("won't spin", "never glows"; a part
  that hums but won't start has not passed) and "choose by what was observed, not by what should
  happen". It fixed both v3 misreads. The P3 note sets didn't regress (9/10 and 12/12, the same as v3).
- **Threshold 0.7 → 0.8** (Remote Config, no app release). Across every on-device run and the P3 sets,
  each wrong answer came at 0.70–0.75 confidence and each right one at 0.80 or higher. At 0.8 those
  answers become a question. The cost: a right answer at 0.75 now asks too (c01 on the iPhone).
- **Not fixed by prompting:** Apple's on-device guardrail sometimes rejects an ordinary note ("flue
  and intake are both clear, termination looks right", "burners r lined up straight"), and a
  different note each run. In the app, the default prefer-on-device route now gives the cloud a second
  look when online; offline the tech taps. r02 ("handle was perpendicular to the pipe" means the
  valve is off) needs trade knowledge the small model lacks, so it asks, which is a safe miss.
- Cloud runs are paced at about 13 requests a minute: an unpaced burst hit the Gemini free tier's
  15 requests/minute (HTTP 429).
