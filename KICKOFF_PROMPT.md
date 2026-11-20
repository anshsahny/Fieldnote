# How to start in Claude Code

1. Do **Part A** of `docs/phases/P0-setup.md` by hand (Mac tooling, GitHub repo, Firebase project, App Check debug tokens, devices, Devpost draft). At the end, the plan package is copied into your cloned repo at `~/code/fieldnote`, with `firebase-web-config.txt` and `GoogleService-Info.plist` sitting in the repo root.
2. `cd ~/code/fieldnote && claude`, then paste the prompt below (fill in the three blanks). This finishes Phase 0.
3. For later phases: **"Start Phase Pn. Read docs/phases/Pn-*.md, then work through it."** Review each checkpoint report, then reply "approved, continue".

---

## Kickoff prompt — finishes Phase 0 (paste into Claude Code)

```
You're my engineering partner for a hackathon build. Read CLAUDE.md, PLAN.md, and docs/phases/P0-setup.md in full. Skim docs/phases/P1-hybrid-spikes.md for context only — do NOT start P1.

Context: Google's #BuildHybridAI hackathon (Firebase AI Logic hybrid inference). Product: Fieldnote — offline-first HVAC diagnostic copilot. iOS app (Apple Foundation Models on-device via Firebase AI Logic) + web console (Chrome Gemini Nano on-device + Gemini cloud). Deadline Mon Nov 30, 5:00 PM ET; I submit by noon. I'm near full-time on this. I know React/TypeScript and Java well, a little Swift — explain iOS/Xcode steps clearly.
My setup: MacBook M4 16 GB, Xcode, iPhone with Apple Intelligence on, free Apple ID signing (no paid program: no TestFlight, no Sign in with Apple, no push).

I've already finished P0 Part A by hand:
- GitHub repo (public, Apache-2.0 license already in it): <REPO URL>
- Firebase project ID: <PROJECT ID>
- iOS bundle ID: <BUNDLE ID>
- AI Logic enabled with the Gemini Developer API, App Check registered, Firestore created (northamerica-northeast2), Email/Password + Anonymous auth enabled.
- Debug tokens generated and saved in my password manager (chrome-localhost, ios-simulator, iphone).
- firebase-web-config.txt and GoogleService-Info.plist are in the repo root. firebase login done; gh auth login <done / not done>.

Now do P0 Part B, in order:
1. Add .gitignore FIRST (node, Xcode, GoogleService-Info.plist, firebase-web-config.txt, .env*, *.debugtoken), then move firebase-web-config.txt into web/.env.local (VITE_ variables) and GoogleService-Info.plist into the iOS app folder. Create .example versions. Confirm with `git status` that no config or token files are tracked.
2. Scaffold everything else per CLAUDE.md and P0 Part B (keep the existing LICENSE). If creating the .xcodeproj from the CLI is unreliable, use XcodeGen with a project.yml — tell me which you chose. Use my exact bundle ID.
3. Verify current Gemini model names in the Firebase AI Logic docs; set cloud_model_fast and cloud_model_compile in remoteconfig.template.json; log them in PLAN.md → Decision log.
4. Deploy Firestore rules/indexes and the Remote Config template (show me the command first).
5. Install the Firebase Agent Skills for Claude Code; record them in docs/agent-skills.md.
6. Tell me exactly where to paste each debug token locally (web .env.local; Xcode scheme env var FIRAAppCheckDebugToken), without ever writing them into tracked files.
7. Walk me through the first run on my iPhone (team selection, trusting the developer certificate).
8. Run the P0 acceptance checks, print the filled-in P0 checkpoint report, update PLAN.md → Progress log, commit and push. Then stop and wait for my approval before P1.

Stop and ask me whenever something needs a console click or a device action.
```
