# P8 — Video, README, write-up, Devpost draft (Sun Nov 29)

**Goal:** every submission field filled and saved as a draft on Devpost by tonight.

## Video (≤ 2:55, hard stop before 3:00)
- Edit per `docs/submission/VIDEO_SCRIPT.md` (iMovie/CapCut/DaVinci). Burned-in English captions + YouTube captions file.
- Upload to YouTube: **Public**, title "Fieldnote — HVAC diagnosis with zero bars (Firebase AI Logic hybrid, iOS + Web)", description with repo + hosted URL + chapters.
- Watch it once start-to-finish on a phone with sound off. Captions must carry the story.

## README.md (judges and AI reviewers read this)
Sections in this order:
1. Hero: one-liner, 20-s GIF, links (video, hosted URL, Devpost).
2. **Why hybrid** — the three-tier promise.
3. **Routing table** (PLAN §4) with links to the exact code lines that call Firebase AI Logic on each platform (requirement R2).
4. **Eval results table** (P6).
5. **Judging criteria map** — Technological Implementation / Design / Potential Impact / Quality of the Idea → bullets with evidence links.
6. Architecture diagram (Mermaid from PLAN §5).
7. Firebase products used and what each does (AI Logic, App Check, Remote Config, Firestore, Auth, Hosting).
8. Run it yourself: web (5 steps), iOS (Xcode, free signing, Simulator notes: macOS + Simulator versions must match for Foundation Models), Firebase setup, `.example` files.
9. Built with: Claude Code + **Firebase Agent Skills** (what they did), Antigravity (only if used).
10. Safety & privacy design. Content sources & disclaimer (not affiliated with manufacturers; for licensed technicians).
11. License (Apache-2.0). "Built during the #BuildHybridAI submission period; no pre-existing code."

## Devpost form
- Paste from `docs/submission/DEVPOST_WRITEUP.md`. Select platforms **iOS** and **Web**. Add the gallery screenshots, video URL, repo URL, hosted URL, testing instructions (`docs/submission/TESTING_INSTRUCTIONS.md`). Built-with tags: firebase, firebase-ai-logic, gemini, gemini-nano, apple-foundation-models, swiftui, react, typescript, firestore, remote-config, app-check, firebase-hosting.
- Save draft. Don't submit yet.

## Acceptance checks
- [ ] `docs/submission/CHECKLIST.md` all ticked except "Submitted".
