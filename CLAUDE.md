# CLAUDE.md — Fieldnote

You are building **Fieldnote**, a solo entry for Google's **#BuildHybridAI** hackathon (Devpost, Firebase AI Logic hybrid inference). Hard deadline: **Mon Nov 30, 2026, 2:00 PM PT / 5:00 PM ET**. Target submit: **Mon Nov 30, 12:00 PM ET**.

Read `PLAN.md` first. It is the source of truth for the product, architecture, routing table, schedule, and phase index. Each phase has its own file in `docs/phases/`.

## What Fieldnote is (one paragraph)
An offline-first diagnostic copilot for HVAC service technicians. A web console (React, Firebase Hosting) uses a **cloud** Gemini model to compile manufacturer PDF manuals into compact, validated **fix packs** (fault codes, causes, step-by-step checks). The **iOS app** caches fix packs, reads nameplates and error displays with Apple Vision OCR, and walks the technician through diagnosis with the **on-device** Apple Foundation Model via Firebase AI Logic hybrid inference, with zero signal if needed. Back online, the cloud writes the customer report. The web console also uses Chrome's on-device Gemini Nano (with image input) to pre-triage customer photos of error displays before dispatch.

## Working rules
1. **Work one phase at a time.** Do not start the next phase until every acceptance check in the current phase file passes and the user has confirmed the checkpoint. At the end of a phase, print the phase's *Checkpoint report* section filled in.
2. **Human checkpoints.** Tasks marked `👤 HUMAN` need the user (Firebase console clicks, physical iPhone runs, filming). Stop, explain exactly what to do in numbered steps, and wait.
3. **Verify APIs before coding.** Firebase AI Logic hybrid inference is *experimental*. Code snippets in the plan are indicative. Before implementing, confirm current API names against the official docs (use the Firebase Agent Skills installed in P0, and WebFetch on firebase.google.com/docs/ai-logic/hybrid/...). If the docs differ from the plan, follow the docs and note the change in `PLAN.md → Decision log`.
4. **Firebase AI Logic must be called at runtime** on both platforms (this is a pass/fail submission rule). Never fake AI responses in shipped code paths. Mocks are allowed only in tests.
5. **Single source of prompts.** All prompts live in `shared/prompts/*.md` with a version header. Both platforms load the same text (iOS bundles a copy at build time via a script; web imports it). Prompt version keys live in Remote Config.
6. **On-device budget.** Keep every on-device request under ~3,000 tokens total (iOS hard cap 4,096; Chrome multimodal cap 9,216). Inject only the relevant fix-pack *slice*, never the whole pack.
7. **Safety is code, not prompt.** Gas, CO, and electrical hazard stops are enforced by deterministic code in the diagnosis engine. The model can never skip or override a safety stop.
8. **No secrets in git.** `GoogleService-Info.plist`, web Firebase config, App Check debug tokens, and `.env*` stay out of the repo. Commit `*.example` versions. Do not commit manufacturer PDFs: store source URLs + page references in `content/sources.json`.
9. **Commits.** Small, conventional commits (`feat(ios): ...`, `test(web): ...`). Push to `main` at the end of each phase. Update the *Progress log* in `PLAN.md`.
10. **Tests travel with code.** Every phase lists automated tests. Write them in the same phase. `npm test` (web) and `xcodebuild test` (iOS) must pass at every checkpoint.
11. **English only**, accessible UI (Dynamic Type on iOS, WCAG AA contrast on web).
12. **Scope discipline.** If a phase runs over by more than half a day, apply the cut list in `PLAN.md` instead of extending. Tell the user what was cut.

## Repo layout (target)
```
fieldnote/
  CLAUDE.md  PLAN.md  README.md  LICENSE (Apache-2.0)
  docs/phases/P0..P9  docs/architecture.md  docs/submission/*
  shared/fixpack.schema.json  shared/prompts/*.md
  content/sources.json  content/fixpacks/*.json
  eval/scenarios/*.json
  web/            # Vite + React + TypeScript
  ios/Fieldnote/  # SwiftUI app, SPM: firebase-ios-sdk
  firebase.json  firestore.rules  firestore.indexes.json  remoteconfig.template.json
```

## Commands (fill in as they become real)
- Web dev: `cd web && npm run dev`
- Web tests: `cd web && npm test`
- Web deploy: `firebase deploy --only hosting`
- iOS build/test: `xcodebuild -project ios/Fieldnote.xcodeproj -scheme Fieldnote -destination 'platform=iOS Simulator,name=iPhone 17' test`
- Rules deploy: `firebase deploy --only firestore:rules,firestore:indexes`
- Remote Config deploy: `firebase deploy --only remoteconfig`
