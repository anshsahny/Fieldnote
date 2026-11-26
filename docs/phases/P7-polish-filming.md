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

**Status: polish done (Nov 26); filming and iPhone checks are the user's (👤).**

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
- **Re-signed:** Debug build installed on the iPhone Nov 26 (free provisioning: valid 7 days, past the deadline).

### Open (👤)
- iPhone eval re-run (on-device + cloud) and Chrome on-device re-run with the v3 packs.
- iOS screenshots (6) from the iPhone during the rehearsal.
- Filming (Sat Nov 28) per `VIDEO_SCRIPT.md`.

