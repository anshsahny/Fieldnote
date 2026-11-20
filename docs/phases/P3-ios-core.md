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
- [ ] Airplane mode: scan → code → ≥4 diagnosis steps with free-text notes answered on-device → conclusion.
- [ ] Safety stop triggers from free text ("I smell gas") with zero model calls.
- [ ] With Apple Intelligence unavailable (simulate via route flag), the same flow works via cloud when online and via plain mode when offline.
- [ ] All XCTests pass.

## Checkpoint report
- Median on-device latency per turn: …
- Clarification rate on a 10-note sample: …
- Known UX issues: …
