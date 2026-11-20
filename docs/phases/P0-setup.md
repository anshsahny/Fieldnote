# P0 — Setup (Wed Nov 18, morning)

**Goal:** every account, tool, and empty project exists, so P1 can call models on both platforms.

**Order:** you do Part A by hand first. Then paste the kickoff prompt (`KICKOFF_PROMPT.md`) and Claude Code does Part B.

## Part A — 👤 HUMAN checklist (do before the kickoff prompt)

### A1. Mac tooling (10 min)
1. `node -v` → must be ≥ 20 (install via `brew install node` if not).
2. `npm i -g firebase-tools` then `firebase login`.
3. Optional but useful: `brew install gh` then `gh auth login` (lets Claude Code push).
4. Xcode ≥ 26 with the iOS 26 SDK; macOS 26 (Tahoe) with Apple Intelligence on (System Settings → Apple Intelligence & Siri).
5. Chrome: `chrome://version` ≥ 148. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and `chrome://flags/#optimization-guide-on-device-model`, relaunch. Open `chrome://on-device-internals` and note the model status.

### A2. GitHub (5 min)
1. Create a **public** repo `fieldnote` (add a README is fine; choose **License: Apache License 2.0** in the create form, so it shows in About).
2. Description: "Offline-first HVAC diagnostic copilot — Firebase AI Logic hybrid inference (iOS + Web)". Topics: `firebase`, `firebase-ai-logic`, `hybrid-ai`, `on-device-ai`, `swiftui`, `react`, `hvac`.
3. Clone it: `git clone <url> ~/code/fieldnote`, then copy this plan package's contents into that folder (keep the structure).

### A3. Firebase project (20–30 min)
1. https://console.firebase.google.com → **Add project** → name `fieldnote-hybrid` (Analytics off). Note the **project ID**.
2. **AI Services → AI Logic → Get started** → choose **Gemini Developer API** (no billing). Follow the workflow; let it enable **App Check** enforcement.
3. **Project settings → General → Add app → Web**: nickname `fieldnote-web`, tick **Firebase Hosting**. Copy the `firebaseConfig` object into a file `~/code/fieldnote/firebase-web-config.txt` (Claude Code moves it into `web/.env.local`; it is gitignored).
4. **Add app → Apple (iOS)**: bundle ID `com.<yourname>.fieldnote` (write it down — Xcode must use the exact same one). Download `GoogleService-Info.plist` into `~/code/fieldnote/` (Claude Code moves it; it is gitignored). Skip the SDK steps in the wizard.
5. **Build → Firestore Database → Create database** → production mode → location `northamerica-northeast2` (Toronto).
6. **Build → Authentication → Get started** → enable **Email/Password** and **Anonymous**.
7. **App Check → Apps:**
   - Web: register with **reCAPTCHA Enterprise** (follow the link to create a key for `localhost` and `<project-id>.web.app`; paste the site key back into App Check).
   - iOS: try **App Attest**. If it refuses on a free Apple account, skip it — we use the debug provider.
   - For each app: **⋮ → Manage debug tokens → Generate token**. Create three: `chrome-localhost` (web), `ios-simulator` and `iphone` (iOS). Save them in a password manager — **never in the repo**.
8. Remote Config: nothing to do (Claude Code deploys a template).

### A4. Devices (10 min)
1. iPhone: Settings → Privacy & Security → **Developer Mode** ON (restart). Settings → Apple Intelligence & Siri → ON, model downloaded.
2. Xcode → Settings → Accounts → add your Apple ID (free **Personal Team**).
3. Connect the iPhone by cable once and trust the Mac.

### A5. Devpost (2 min)
1. On https://firebasehybridaihackathon.devpost.com/ → **Enter a submission / Start project** → name **Fieldnote**. Save the draft (editable until the deadline).

**When Part A is done, paste the kickoff prompt.** Have ready: project ID, bundle ID, GitHub repo URL.

## Part B — 🤖 Claude Code tasks (run by the kickoff prompt)
1. Move `firebase-web-config.txt` → `web/.env.local` and `GoogleService-Info.plist` → `ios/Fieldnote/` (both gitignored). Create `.example` versions.
2. Scaffold per `CLAUDE.md`: `.gitignore`, README stub (keep the Apache LICENSE from GitHub), `web/` (Vite + React + TS; firebase ≥ 12.5, zod, react-router-dom; vitest, testing-library, playwright), `ios/` SwiftUI app with the exact bundle ID, unit test target, SPM firebase-ios-sdk ≥ 12.13 (FirebaseAILogic, FirebaseAppCheck, FirebaseFirestore, FirebaseAuth, FirebaseRemoteConfig), `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `remoteconfig.template.json`, `shared/`, `content/`, `docs/agent-skills.md`.
3. Verify current model names in the Firebase AI Logic docs → set `cloud_model_fast` and `cloud_model_compile` in the Remote Config template; log in the Decision log.
4. Deploy Firestore rules/indexes and Remote Config.
5. Install **Firebase Agent Skills** for Claude Code; record them in `docs/agent-skills.md`.
6. Explain where each debug token goes (web: `web/.env.local`; iOS: Xcode scheme environment variable `FIRAAppCheckDebugToken`, kept out of git).
7. Walk you through the first iPhone run (select your Personal Team; trust the developer certificate on the iPhone: Settings → General → VPN & Device Management).

## Acceptance checks
- [ ] `cd web && npm run build && npm test` pass (empty test OK).
- [ ] iOS project builds for Simulator and runs on the iPhone (blank screen OK).
- [ ] Firestore rules and Remote Config deployed.
- [ ] Repo public, About shows Apache-2.0, config files and tokens not in git (`git status` clean of them).
- [ ] Agent skills installed and listed in `docs/agent-skills.md`.

## Checkpoint report (fill in)
- Project ID / bundle ID / repo URL: …
- Model names chosen: …
- Anything blocked: …
