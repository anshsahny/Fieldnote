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

## Automated tests (must all pass)
- Web: `npm test`, Playwright smoke on hosted URL.
- iOS: `xcodebuild test`.
- Rules: emulator tests.
- CI: GitHub Actions for web tests + rules tests (badge in README).

## Acceptance checks
- [ ] Eval table generated from real runs on both platforms.
- [ ] CI green.
- [ ] Every error state reachable and handled (checklist in this file, ticked).

## Checkpoint report
- Eval table pasted here.
- Prompt changes made.
