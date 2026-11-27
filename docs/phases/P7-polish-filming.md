# P7 — Design polish + filming (Sat Nov 28)

**Goal:** it looks and feels like a shipped product, and all footage for the video is recorded.

## Morning: polish pass (Claude Code + you)
- App icon + web favicon (simple wrench/notebook glyph, our own design).
- Typography, spacing, motion (step transitions, badge pulse on source change), haptics.
- Copy pass: every string plain, short, technician-friendly.
- Screenshots: 6 iOS (Today, Scan, Fault, Diagnose, Safety, Report) + 4 web (Dashboard, Triage, Ledger, Packs) at native resolution for Devpost gallery.
- **Re-sign the iOS build** from Xcode today (free provisioning expires after 7 days).

## Afternoon: filming 👤 HUMAN
Follow `docs/submission/VIDEO_SCRIPT.md` shot list.
- **Real unit (preferred):** furnace/AC you identified. Film: walking down to the basement, phone status bar showing **no signal / airplane mode**, scanning the nameplate, the LED blinking, entering the code, two diagnosis turns with the green on-device badge.
- **Backup:** printed nameplate taped to a box + LED mock (Arduino/any microcontroller blinking the code, or a phone showing a blinking LED video) in a dim room.
- iPhone screen recording (Control Center → Screen Recording) for clean UI captures, plus a second phone/camera for over-the-shoulder shots.
- Mac: QuickTime/OBS screen recording of the web console (1080p+, Chrome zoom 110%): triage on-device, flip route flag, Ledger, `/status`.
- Optional: 15-second voice clip or quote from a real HVAC technician (only with their permission; no endorsement implied).

## Acceptance checks
- [ ] All shots in the list captured, with at least one backup take each.
- [ ] Screenshots exported.
- [ ] Build re-signed and working on the iPhone.

## Checkpoint report

**Status: polish and review done (Nov 26–27); filming is the user's (👤).**

### Done
- **Fix-pack hint** (P6 follow-up): Rheem and Carrier v3 add "handle in line with the pipe = on, across =
  off" to the manual gas valve steps. Published and exported byte for byte. Simulator on-device: r02 now
  "valve off"; 63/64 turns right (only c04 asks), cloud 64/64. Chrome on-device re-run pending (👤).
- **Brand:** our own mark (field-note page + diagnostic trace) for the iOS app icon (the slot was
  empty), the favicon, the touch icon and the in-app and console logos, all from one grid
  (`scripts/make-icons.swift`). The in-app logo is no longer an SF Symbol.
- **Prewarm:** iOS loads Apple's model when a job opens; Chrome opens a Gemini Nano session when triage
  or /eval loads. iPhone first call after the change: 0.9 s (P3 saw up to 15 s cold).
- **Motion and haptics:** steps fade and slide in, the source badge bounces when on-device ↔ cloud
  switches, a success haptic on the conclusion (existing: step, safety, clarify).
- **Triage clarity:** a matched code shows the fix pack's meaning; the model's free-text guess only when
  no pack matches (they disagreed on the EE2 sample).
- **Bundle:** console entry chunk 966 KB → 118 KB (React and Firebase core cached separately).
- **Copy pass:** visible iOS strings reviewed; already plain (debug-only screens keep their jargon).
- **Screenshots (web):** 6 console screenshots at 2880×1800 in `docs/submission/screenshots/`
  (`SHOTS=1 npx playwright test e2e/screenshots.spec.ts`).
- **Filming kit:** `VIDEO_SCRIPT.md` updated to the Goodman EE0 flow; the exact notes pass 6/6 on-device
  in the Simulator (`eval/scenarios/p7-filming.json`); display prop at
  https://fieldnote-c28dc.web.app/props/display.html?code=EE0; printable nameplate in `content/samples/`.
- **Re-signed (Nov 27):** the Nov 26 install had reused the Nov 20 profile, which expired Nov 27 00:31;
  a fresh team profile (valid to Dec 4, past the deadline) and a reinstall; the user re-trusted the
  developer on the iPhone.
- **Re-runs (Nov 27, 👤 + automated):** Chrome on-device 64/64, 0 wrong (first call 9.9 s after prewarm,
  was 59 s); iPhone on-device 54/56 clear notes, 0 wrong, median 0.65 s; iPhone cloud 64/64. The iPhone's
  one model error was Apple's guardrail on "termination looks right" (3 of 4 iPhone runs; probe in
  `eval/scenarios/p7-guardrail-probe.json`).

### Full review pass (Nov 27)
Judged against the official criteria (Technological Implementation, Design, Potential Impact,
Quality of the Idea; equal weight, tiebreak in that order) after a screen-by-screen walk-through of
both apps.
- **iOS:** the AI turn now shows the tech's note, "Read as <answer>" and the badge together (the AI
  moment was the hardest thing to see); answers sentence-cased everywhere; the safety stop shows the
  note that raised it, says it came from code before any AI, and opens with what to do (no repeated
  "Stop. Possible gas leak."); **Send to customer** on the report (share sheet, plain text); guardrail
  errors retry once on-device before the cloud; P3 note harness removed (P6 scenarios supersede it).
- **Web:** the EE0 customer photo replaces EE2 so triage, the R. Okafor job and the filmed flow tell
  one story (cloud read it as EE0 at 95%, matched the pack); the dashboard headline is diagnosis notes
  on-device (manual compile is cloud-only by design and was dragging the all-calls share to 42%); How
  it works shows the measured on-device vs cloud table (generated from `eval/results` by
  `npm run eval:report`); the job-summary row was removed from the routing table (not a shipped
  feature); loading state; capitalized causes; an unused test dependency removed.
- **Docs:** README rewritten for judges (call-site links for both platforms, eval table, criteria map,
  safety and privacy, disclaimer); Devpost write-up filled in; impact numbers now from the BLS outlook
  (the plan's 110,000 / 5-for-2 figures had no primary source); full video script with dialogue.
- **Tests:** iOS 100/100, web 212/212.

### Open (👤)
- iOS screenshots (6) from the iPhone during the rehearsal.
- Filming (Sat Nov 28) per `VIDEO_SCRIPT.md`; reset the demo day first.
- Optional: rerun the iPhone on-device eval with the guardrail retry (Diagnostics → P6 scenarios →
  Run on-device only, phone unlocked).

