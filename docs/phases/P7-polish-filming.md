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
