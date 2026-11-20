# Fieldnote

Offline-first HVAC diagnostic copilot — Firebase AI Logic hybrid inference (iOS + Web).

The cloud turns manufacturer manuals into compact, validated **fix packs**. The phone's own AI
(Apple Foundation Models through Firebase AI Logic) walks the technician through diagnosis, even
with zero bars in a basement. The web console uses Chrome's on-device Gemini Nano to pre-triage
customer photos of error displays before dispatch.

> **Status:** Phase 1 (hybrid spikes) passed its GO gate on real hardware. On-device inference works
> on the iPhone (Apple Foundation Models via Firebase AI Logic, including in airplane mode) and in Chrome
> (Gemini Nano, text + image), with cloud fallback on both. The product features come next. Plan:
> [`PLAN.md`](PLAN.md) · P1 results: [`docs/phases/P1-hybrid-spikes.md`](docs/phases/P1-hybrid-spikes.md).

## Repo layout

```
web/                 Vite + React + TypeScript dispatcher console (Firebase Hosting)
ios/                 SwiftUI app; ios/project.yml (XcodeGen) is the source of truth for the .xcodeproj
shared/prompts/      Single source of prompts for both platforms (versioned)
content/             Fix packs + manual source URLs (no PDFs in the repo)
eval/scenarios/      Diagnosis eval scenarios (Phase 6)
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

### 4. Firebase backend
```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only remoteconfig
firebase deploy --only hosting     # after npm run build
```

## Built with AI assistance
Developed with Claude Code and the official **Firebase agent skills** (installed at project scope;
see [`docs/agent-skills.md`](docs/agent-skills.md) for exactly what each skill was used for).

## License
[Apache-2.0](LICENSE)
