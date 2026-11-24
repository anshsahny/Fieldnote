# P6 — Eval harness, hardening, tests (Fri Nov 27)

**Goal:** evidence. A table in the README showing on-device vs cloud quality and speed on real scenarios is the strongest "Technological Implementation" proof we can give judges and any AI-assisted review.

## Eval harness
1. `eval/scenarios/*.json` — **24 scenarios** (8 per brand): `{packId, code, notes: ["inducer hums but doesn't spin", ...], expectedChoices: [...], expectedConclusion, mustSafetyStop: bool}`. Include 4 safety scenarios, 4 messy-language notes (slang, typos), 4 ambiguous notes that should trigger clarification.
2. **iOS runner** (hidden Eval screen): runs every scenario through the engine with route forced to (a) on-device only, (b) cloud only. Records choice accuracy, clarification rate, safety-stop correctness, latency. Exports JSON → AirDrop/share to Mac → `eval/results/ios-<date>.json`.
3. **Web runner** (`/eval`, dev only): same scenarios through Chrome on-device vs cloud.
4. `scripts/eval-report.ts` → Markdown table for README:

| Route | Choice accuracy | Clarify rate | Safety stops | Median latency | Cloud cost |
|---|---|---|---|---|---|
| iOS on-device | | | 4/4 (code) | | $0 |
| iOS cloud | | | 4/4 (code) | | $… |
| Chrome on-device | | | 4/4 (code) | | $0 |
| Chrome cloud | | | 4/4 (code) | | $… |

5. Use results to tune prompts (bump `prompt_version_*`), then re-run once. Report honestly, including misses.

## Hardening
- Error states: no camera permission, App Check failure, Remote Config fetch failure (defaults), Firestore permission denied, model `modelNotReady` (download in progress), rate limit (backoff + plain mode).
- Empty states and loading skeletons on every screen.
- Privacy check: grep the code paths that send to cloud; confirm no address/phone/serial goes into cloud prompts unnecessarily; triage images only go to cloud when on-device is unavailable and the user confirms ("Send photo to cloud AI?" dialog). This is a nice privacy-by-design detail to show.
- Optional (only if true): run the web test pass inside **Antigravity** and note it in README.

### Error-state checklist (P6)
| State | iPhone | Web console | Check |
|---|---|---|---|
| [x] No camera permission | Asked on first tap; if off, an alert offers Settings and the other way in (choose a photo / type the code) | n/a (file picker, no camera) | Settings → Fieldnote → Camera off, tap "Take a photo" |
| [x] App Check failure | Cloud call fails → the diagnosis asks the tech to tap ("AI unavailable right now"); reports keep the on-device/plain draft and retry | Plain-language "bot check" message, no load-time token spend (P5) | Unregistered debug token; `appCheckErrors.test.ts` |
| [x] Remote Config fetch failure | Last activated values, else bundled defaults (`AIConfigLoader`) | Same (`loadAIConfig`, `origin: defaults`) | Airplane mode at launch; `config.test.ts` |
| [x] Firestore permission denied | Today shows "Can't show your jobs" with the reason; pull to refresh listens again; packs stay usable | Jobs, ledger, packs, job detail show the error in place of the list | Sign in as a user with no profile |
| [x] On-device model not ready | Status card says it's downloading (or how to turn Apple Intelligence on); diagnosis uses cloud online, plain mode offline | Status page shows downloadable/downloading; triage asks before using the cloud | Simulator without Apple Intelligence |
| [x] Rate limit | 429 or the on-device limit pauses the model for 60 s; the tech taps meanwhile (`rateLimitPausesTheModelForAMinute`). Report upgrades retry 2/5/15/30 s | Triage: "The cloud model is busy right now. Try again in a minute." | Engine test; eval runs pace cloud calls |
| [x] Empty states + loading | Jobs (spinner, empty, error), packs sheet, report states | Skeleton + empty + error on dashboard, jobs, job detail, ledger, packs | Visual pass |

### Privacy check (P6)
- Diagnosis prompts: the current step, its allowed answers, the last 3 answers and the tech's note. No customer data.
- Reports: built from PII-free facts only (P4); the app prints the customer header itself.
- Nameplate prompts: the serial number is replaced with `[withheld]` before any model sees the OCR lines; code reads it (`serialIsWithheldFromModelPrompts`).
- Triage: phone numbers and emails are stripped from the customer's message before any model (`privacy.test.ts`); the photo goes to the cloud only after the dispatcher confirms.
- Ledger (`inferenceEvents`): metadata only (feature, source, latency, token estimate, model).

## Automated tests (must all pass)
- Web: `npm test`, Playwright smoke on hosted URL.
- iOS: `xcodebuild test`.
- Rules: emulator tests.
- CI: GitHub Actions for web tests + rules tests (badge in README).

## Acceptance checks
- [x] Eval table generated from real runs on both platforms (iPhone, Simulator, Chrome cloud; Chrome on-device pending the user).
- [x] CI green.
- [x] Every error state reachable and handled (checklist in this file, ticked).

## Checkpoint report

**Status: complete (Nov 24), awaiting approval to start P7.** Chrome on-device eval row pending (needs Gemini Nano in the user's Chrome).

### Eval table (from `eval/results/*.json`, `npm run eval:report`)
| Route | Right answer on clear notes | Wrong answer accepted | Asked instead of answering | Model errors | Asked on hedged notes | Safety stops | Scenarios fully right | Median latency | Cloud cost (all turns) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone · On-device | 51/56 (91%) | **0** | 4 | 1 | 4/4 (100%) | 4/4, 0 model calls | 20/24 | 0.72 s | $0 |
| iPhone · Cloud | 56/56 (100%) | **0** | 0 | 0 | 4/4 (100%) | 4/4, 0 model calls | 24/24 | 1.15 s | $0.02 |
| iOS Simulator · On-device | 54/56 (96%) | **0** | 2 | 0 | 4/4 (100%) | 4/4, 0 model calls | 22/24 | 1.09 s | $0 |
| iOS Simulator · Cloud | 56/56 (100%) | **0** | 0 | 0 | 4/4 (100%) | 4/4, 0 model calls | 24/24 | 1.04 s | $0.02 |
| Chrome · Cloud | 56/56 (100%) | **0** | 0 | 0 | 4/4 (100%) | 4/4, 0 model calls | 24/24 | 1.00 s | $0.02 |

Full report with every miss: [`eval/results/README.md`](../../eval/results/README.md).

### What the eval found and what changed
- **Safety gap (fixed before any model run):** "smells like something's burning near the motor" didn't
  stop, because the apostrophe split "something's" and pushed "burning" out of the trigger window. Fixed in both
  SafetyGuards, and the rule cases now live in `shared/fixtures/diagnosis/rules.json` and run in both test
  suites.
- **Prompt v3 → v4** (`shared/prompts/diagnosis.md`, `prompt_version_diagnosis` = 4): spoken negations
  ("won't spin", "never glows") and "choose by what was observed". Fixed both v3 on-device misreads; P3 note
  sets unchanged (9/10, 12/12).
- **Threshold 0.7 → 0.8** (Remote Config, deployed): every wrong on-device answer came at 0.70–0.75, every
  right one at ≥ 0.80. Result: **0 wrong answers accepted on every route**; the on-device misses that remain
  ask the tech (one tap).
- **Guardrail false positives** (Apple on-device: "…termination looks right", "burners r lined up
  straight"; a different note each run): on prefer_on_device the cloud now takes a second look when online.
- **Free-tier rate limit:** an unpaced cloud run hit 15 requests/minute (429). Eval runs are paced; the app
  pauses the model for 60 s after a 429 and the tech taps.

### Hardening
Error-state checklist and privacy check above (all ticked). New: camera-permission flow, jobs load-error
state, Apple Intelligence status in plain words, rate-limit pause, guardrail second look, serial numbers
withheld from model prompts, contact details stripped from triage prompts, packs load error on the web.

### Tests
- iOS 97/97 (`xcodebuild test`), web 209/209 (Vitest), rules 25/25 (emulator).
- CI (GitHub Actions, badge in README): web typecheck + unit tests + build, rules tests. Green on the
  first run.

### Open
- Chrome on-device eval row (user step, about 5 minutes).
- Camera-permission alert checked in code and by build only; the Simulator has no camera (optional iPhone check).
- P7 items carried: prewarm the on-device model, bundle code-split, `seed --reset` before filming.
