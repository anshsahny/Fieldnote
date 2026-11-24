# Fieldnote

[![CI](https://github.com/anshsahny/Fieldnote/actions/workflows/ci.yml/badge.svg)](https://github.com/anshsahny/Fieldnote/actions/workflows/ci.yml)

Offline-first HVAC diagnostic copilot — Firebase AI Logic hybrid inference (iOS + Web).

The cloud turns manufacturer manuals into compact, validated **fix packs**. The phone's own AI
(Apple Foundation Models through Firebase AI Logic) walks the technician through diagnosis, even
with zero bars in a basement. The web console uses Chrome's on-device Gemini Nano to pre-triage
customer photos of error displays before dispatch.

> **Status:** Phase 6 done. Three validated fix packs (Goodman, Carrier, Rheem) compiled from
> manufacturer manuals in the web console; the iPhone app diagnoses on-device in airplane mode, saves
> every step offline and writes the customer report in the cloud when signal returns; the console
> pre-triages customer photos with Chrome's on-device model and shows the hybrid ledger. Live console:
> https://fieldnote-c28dc.web.app · Plan: [`PLAN.md`](PLAN.md) · Eval: [`eval/results`](eval/results/README.md).

## Repo layout

```
web/                 Vite + React + TypeScript dispatcher console (Firebase Hosting)
ios/                 SwiftUI app; ios/project.yml (XcodeGen) is the source of truth for the .xcodeproj
shared/prompts/      Single source of prompts for both platforms (versioned)
content/             Fix packs + manual source URLs (no PDFs in the repo)
eval/scenarios/      Diagnosis eval scenarios; eval/results/ holds the runs and the report
scripts/             Local setup helpers
firestore.rules  firestore.indexes.json  remoteconfig.template.json  firebase.json
docs/                Phase plans, architecture, agent skills, submission material
```

## How Firebase is used

| Product | Job in Fieldnote |
|---|---|
| **AI Logic** (Gemini Developer API) | Hybrid inference: on-device first for diagnosis and photo triage, cloud for compiling manuals and customer reports |
| **App Check** | Required by AI Logic. Web: reCAPTCHA Enterprise. iOS: App Attest (debug provider in development) |
| **Remote Config** | Per-feature routing (`route_*`), cloud model names, prompt versions, token budgets |
| **Firestore** | Fix packs, jobs, offline diagnosis sessions, reports, and the hybrid-inference ledger (metadata only) |
| **Authentication** | Email/password + anonymous demo login |
| **Hosting** | The web console |

Current routing and model defaults live in [`remoteconfig.template.json`](remoteconfig.template.json).

## Eval: on-device vs cloud

24 diagnosis scenarios (8 per brand, 64 technician notes: clean, messy, hedged, safety and
trade-knowledge) run through each platform's own rules with the route forced. Safety stops are code
and never reach a model. Full report, every miss, and what was tuned:
[`eval/results/README.md`](eval/results/README.md).

| Route | Right answer on clear notes | Wrong answer accepted | Asked instead of answering | Model errors | Asked on hedged notes | Safety stops | Scenarios fully right | Median latency | Cloud cost (all turns) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone · On-device | 51/56 (91%) | **0** | 4 | 1 | 4/4 (100%) | 4/4, 0 model calls | 20/24 | 0.72 s | $0 |
| iPhone · Cloud | 56/56 (100%) | **0** | 0 | 0 | 4/4 (100%) | 4/4, 0 model calls | 24/24 | 1.15 s | $0.02 |
| iOS Simulator · On-device | 54/56 (96%) | **0** | 2 | 0 | 4/4 (100%) | 4/4, 0 model calls | 22/24 | 1.09 s | $0 |
| iOS Simulator · Cloud | 56/56 (100%) | **0** | 0 | 0 | 4/4 (100%) | 4/4, 0 model calls | 24/24 | 1.04 s | $0.02 |
| Chrome · Cloud | 56/56 (100%) | **0** | 0 | 0 | 4/4 (100%) | 4/4, 0 model calls | 24/24 | 1.00 s | $0.02 |

**Wrong answer accepted** is the miss that matters; every other on-device miss is a question to the
tech (one tap). Prompt v4 and a 0.8 confidence threshold (Remote Config) got it to zero on every route.

## Run it yourself

### Prerequisites
- Node ≥ 20.19, Firebase CLI (`npm i -g firebase-tools`), Xcode 26+ (built with Xcode 27.2 / iOS 27 SDK; deployment target iOS 26), [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`, only needed if you change `ios/project.yml`).
- A Firebase project with AI Logic (Gemini Developer API), App Check, Firestore, and Auth enabled.
- For on-device inference: Chrome ≥ 139 on desktop with the Prompt API model available, and an iPhone with Apple Intelligence enabled.

### 1. Local secrets (never committed)
Every secret file is gitignored and has a committed `.example` twin.

| File | Holds | How to create |
|---|---|---|
| `firebase-web-config.txt` | Web `firebaseConfig` from the console | copy `firebase-web-config.txt.example` |
| `.local-secrets` | reCAPTCHA site key + App Check debug tokens | copy `.local-secrets.example` |
| `ios/Fieldnote/GoogleService-Info.plist` | iOS app config | download from the console (`ios/GoogleService-Info.plist.example` shows the shape) |

Then generate the derived files:

```bash
node scripts/setup-local-secrets.mjs
```

It writes `web/.env.local`, `web/.env.development.local`, and `ios/Config/Secrets.xcconfig`, and
prints key names only.

**Where the App Check debug tokens go, and why**
- **Web:** `web/.env.development.local`. Vite loads that file only for `npm run dev`, so a production
  build can never inline the token. The app applies it only on `localhost`, and
  `npm run build` runs `web/scripts/check-dist-secrets.mjs`, which fails the build if any debug token
  appears in `web/dist`.
- **iOS:** `ios/Config/Secrets.xcconfig` → Info.plist (Debug configuration only; Release has empty
  values) → exported as the `AppCheckDebugToken` env var before `FirebaseApp.configure()`. The
  Simulator uses the simulator token and a real iPhone uses the device token. This also works when the
  app is launched from the Home Screen, which an Xcode scheme env var doesn't. A scheme env var
  (`AppCheckDebugToken` / `FIRAAppCheckDebugToken`) still overrides it.

### 2. Web console
```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # typecheck + production build + secret scan
npm run test:e2e   # Playwright smoke test (uses your installed Chrome)
```

### 3. iOS app
The app uses **firebase-ios-sdk 12.19.3** on purpose: it is the last release with Firebase AI Logic's
hybrid API (`HybridModel` / `FirebaseAI.SystemLanguageModel`), which 13.0 removed. On-device inference
needs an iPhone with Apple Intelligence enabled and its model downloaded.

```bash
open ios/Fieldnote.xcodeproj
```
Pick your team under *Signing & Capabilities* (or set `DEVELOPMENT_TEAM` and the bundle ID in
`ios/project.yml` and run `cd ios && xcodegen generate`), choose a Simulator or your iPhone, and press
⌘R. Tests:

```bash
xcodebuild -project ios/Fieldnote.xcodeproj -scheme Fieldnote \
  -destination 'platform=iOS Simulator,name=iPhone 17' test
```

### Hybrid spikes (debug builds only)
- Web: `npm run dev` in `web/`, then open http://localhost:5173/spike in Chrome and click **Run all**
  in each mode. Each row shows the SDK-reported `inferenceSource` and latency.
- iOS: **Debug → Hybrid spikes** in the app, or headless with launch arguments
  `-FNRunSpikes all` / `-FNRunSpikes offline` (results print as `FNSPIKE {json}` lines).

### Diagnosis eval (debug builds only)
The 24 scenarios in [`eval/scenarios/p6-scenarios.json`](eval/scenarios/p6-scenarios.json) run
through each platform's own rules with the route forced, and write the same JSON:
- iOS: **Diagnostics → P6 scenarios** (long-press the logo on Today; Share sends the JSON), or headless:
  `xcrun devicectl device process launch --console --device <id> com.anshsahny.fieldnote -- -FNRunScenarios both -FNExitWhenDone YES`
  (`FNEVALRUN {json}` lines). On the Simulator use `xcrun simctl launch --console-pty`.
- Chrome: http://localhost:5173/eval (dev server) → **Run** → **Download JSON**. The cloud route also
  runs headless: `cd web && EVAL_ROUTE=only_in_cloud npx playwright test e2e/eval.spec.ts`.
- Put the JSON in `eval/results/`, then `cd web && npm run eval:report`.

### 4. Firebase backend
```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only remoteconfig
firebase deploy --only hosting     # after npm run build
```

Demo data and packs (admin scripts use Application Default Credentials: `gcloud auth application-default login`):
```bash
cd web && npm run seed            # demo org, dispatcher + tech accounts, 5 fictional jobs, packs from content/fixpacks
cd web && npm run packs:export    # published packs → content/fixpacks/ (byte-for-byte)
cd rules-tests && npm install && npm test   # Firestore rules tests on the local emulator (needs Java)
node scripts/ai-health.mjs gemini-3.5-flash-lite   # is Firebase AI Logic answering right now?
```

Fix packs are compiled in the console at `/packs` (dispatcher sign-in): choose a manual and its diagnostics
pages, read the fault-code index, compile selected codes, review, publish. The format is
[`shared/fixpack.schema.json`](shared/fixpack.schema.json); sources and page references are in
[`content/sources.json`](content/sources.json) (manual PDFs are never committed).

## Built with AI assistance
Developed with Claude Code and the official **Firebase agent skills** (installed at project scope;
see [`docs/agent-skills.md`](docs/agent-skills.md) for exactly what each skill was used for).

## License
[Apache-2.0](LICENSE)
