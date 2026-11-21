# P3 — iOS core (Sat Nov 21 – Mon Nov 23)

**Goal:** a technician can go from "today's jobs" to a finished diagnosis on the real iPhone in airplane mode.

## Screens (SwiftUI, navigation stack)
1. **Onboarding (first launch):** "For licensed HVAC technicians" acknowledgement; Apple Intelligence status check with a clear message if unavailable ("Fieldnote will use cloud AI when online, and plain fix packs when offline"). Sign-in (email/password; demo button).
2. **Today:** job cards (customer, address, symptom, equipment if known). Status chips. Offline banner + "packs ready offline ✓ (3)".
3. **Scan:** camera (VisionKit `DataScannerViewController` for live text, or photo + `VNRecognizeTextRequest`). Extract brand/model/serial with regex per brand from packs' `modelPatterns`. If ambiguous → on-device model picks among candidates (structured output). Manual entry fallback.
4. **Fault code:** big keypad "How many flashes?" / code entry; or scan a digital display. Deterministic lookup → fault card (meaning, likely causes, source ref).
5. **Diagnose:** one step card at a time: instruction, input (tap options, numeric reading with unit, or free-text "what do you see?"). Free text → engine → next step. Step history timeline. "Why this step?" expandable (the model's `say`). Inference badge on each AI turn.
6. **Safety stop:** full-screen red interstitial; requires explicit acknowledgement; logged.
7. **Conclusion:** probable cause, recommended fix, parts (from pack), time on job → "Create report" (P4).
8. **Debug/Eval (hidden, long-press logo):** availability, route config, last 20 inference events, run eval scenarios (P6).

## Engine (`DiagnosisEngine.swift`, pure + testable)
- State machine over the pack's step graph. Inputs: `.tap(key)`, `.reading(value, unit)`, `.note(text)`.
- `.note` path: (1) SafetyGuard regex/keyword check on raw text → stop if hit; (2) build prompt from `shared/prompts/interpret_observation.md` with only the current step + allowed keys + last 3 history items; (3) hybrid on-device-first call; (4) validate `choice ∈ allowed`; (5) confidence < `rc.min_confidence` or `unclear` → ask a tap question from the allowed keys.
- `.reading` path: numeric comparisons are **code** (pack defines `expectedRange`); model only explains.
- Every model call → `InferenceEvent(feature, source, latencyMs, promptTokensEst)` saved to Firestore (metadata only).
- If both AI routes fail → plain mode: show allowed options as buttons. Never dead-end.

## Design notes (field-first)
- Dark theme default (basements), high contrast, 56-pt min touch targets (gloves), one-handed bottom actions, Dynamic Type, haptics on step change.
- Badges: `On-device · 0.6 s · $0` (green), `Cloud · 1.8 s` (blue), `Plain mode` (gray), `Offline · 2 queued` (amber).

## Automated tests (XCTest)
- Engine: full walk of each pack's main path with scripted taps; every `next` reachable; safety trigger stops before any AI call (assert AI mock not called).
- Prompt builder: token estimate ≤ `rc.ondevice_max_tokens` for every step in every pack.
- Parser/validator: out-of-enum choice rejected; low confidence → clarification.
- OCR extraction: regex fixtures for each brand's model numbers.

## 👤 HUMAN checks
- Run the full flow on the iPhone in airplane mode for one fault code per brand. Note anything awkward.

## Acceptance checks
- [x] Airplane mode: scan → code → ≥4 diagnosis steps with free-text notes answered on-device → conclusion.
  iPhone (user, twice): Goodman EE0 (5 steps), Rheem 11 (4), Carrier 13 (3, its longest path), every note on-device.
  Note: the iPhone runs started at fault-code entry (job equipment was known); nameplate scan → pack match was
  verified on the Simulator (Vision OCR 1.0 s, on-device by nature).
- [x] Safety stop triggers from free text ("I smell gas") with zero model calls. Simulator and iPhone (ledger:
  2 `safety_stop` rows, 0 ms); unit test asserts the interpreter is never called.
- [x] With Apple Intelligence unavailable (simulate via route flag), the same flow works via cloud when online and via plain mode when offline.
  Route override `only_in_cloud` (Diagnostics sheet) → "Cloud AI" chip and cloud turns; cloud eval 10/10 + 12/12.
  Plain mode offline is covered by unit tests (AI failure and no interpreter both fall back to taps), not run by hand.
- [x] All XCTests pass: iOS 67/67 (Swift Testing). Web 86/86.

## Checkpoint report
- **Median on-device latency per turn:** iPhone eval **0.69 s** (10-note set) and **0.74 s** (12 walkthrough notes),
  back to back. In real airplane-mode use the ledger shows a **1.1 s** median over 24 turns (0 failures); the slowest
  turn was 15 s, almost certainly the first call loading the model after launch.
- **Clarification rate on a 10-note sample:** on-device **4/10** = the 3 hedged notes (correct: a guess must not
  advance) + 1 safe miss ("handle was perpendicular to the pipe" asks instead of answering "valve off"). Cloud 3/10.
  Accuracy on-device 9/10, cloud 10/10. On the 12 clear walkthrough notes: 0/12 asked, 12/12 correct, both routes.
  Every request ≈ 520 tokens (budget 3,000). Details: `eval/results/p3-notes.md`.
- **Fixed during the check:** the on-device model sometimes shortens an option ("loose" for "loose or defective"),
  which the exact-match validator dropped, and the resulting "pick an answer" prompt sat behind the keyboard
  (Carrier stall). One iPhone misread of a negation ("no coating" → "oxidized", not reproducible). Prompt v3 made a
  hedged note advance once. Fixes: unambiguous-shorthand matching (iOS + web), clarifications drop the keyboard and
  scroll into view, Undo everywhere plus "read as …" on the conclusion, hedge words ask in code, negation rule in
  prompt v3, threshold 0.7.
- **Known UX issues / follow-ups:**
  - First on-device call after launch can take several seconds; prewarm the session when a diagnosis starts (P7).
  - Trade-knowledge notes (valve handle orientation) ask instead of answering; fine for safety, P6 eval will track.
  - "Create customer report" is a disabled placeholder until P4.
  - Job statuses changed during testing; re-seed (`npm run seed`) before filming.
  - Simulator-only: taps need a short hold when driven by automation (no effect on the app).
