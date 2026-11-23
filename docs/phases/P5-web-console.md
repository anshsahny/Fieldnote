# P5 — Web console (Wed Nov 25 – Thu Nov 26)

**Goal:** a polished, hosted dispatcher console where Chrome's on-device model does real work, plus the compiler from P2.

## Routes
- `/login` — email/password + **"Try the demo"** button (signs into the seeded demo dispatcher; credentials also in testing instructions).
- `/` **Dashboard** — today's jobs, techs, recent reports, Hybrid Ledger summary tiles (on-device share %, calls, est. cloud cost avoided, median latency by source).
- `/triage` **Photo pre-triage** — drop a customer photo (JPEG/PNG; HEIC converted client-side) → `PREFER_ON_DEVICE` multimodal → structured `{brand?, model?, displayedCode?, likelyFault?, partsToBring[], confidence}` → matched against published packs (code lookup) → "Attach to job". Show the photo never left the browser when on-device (badge + note). Include 4 sample photos (our own, of the printed mock / demo unit) for judges.
- `/jobs` — list/detail; detail shows the field session timeline (steps, readings, which model answered each turn) and the report(s).
- `/packs` — compiler + review + publish (from P2), plus version history.
- `/ledger` **Hybrid Ledger** — charts (calls by feature × source, latency distributions, cost-avoided estimate with the formula shown), filter by platform. Data = `inferenceEvents` only.
- `/status` **Hybrid status** — this browser's on-device availability (text, image), model download state, Chrome version, step-by-step enable instructions, and a live "test on-device" button. Judges land here first if their Chrome lacks the model.
- `/about` — the three-tier promise and routing table (rendered from Remote Config).

## Tasks
1. Design system (match iOS look: dark/light, same badge colors, Inter/system font). Use the `frontend-design` mindset: purposeful, not template-y.
2. Route flags from Remote Config; a dev-only "flip route" control (for the video: switch `route_triage` to cloud → badge changes live).
3. Cost-avoided estimate: tokens est. × current published price per 1M tokens for `cloud_model_fast` (store price in Remote Config, cite source in `/about`).
4. Deploy: `firebase deploy --only hosting`. App Check reCAPTCHA Enterprise on the hosted domain (no debug token in prod).
5. Playwright smoke test against the hosted URL: demo login → dashboard → triage sample photo → result visible (cloud or on-device) → ledger renders.

## Automated tests
- Vitest: triage result → pack matching; ledger aggregation math; route flag mapping.
- Playwright smoke (above).

## 👤 HUMAN checks
- Open the hosted URL in a **fresh Chrome profile** (no debug token, no flags) → everything works via cloud; `/status` explains how to enable on-device.
- Open on your dev Chrome → triage runs on-device.

## Acceptance checks
- [x] Hosted URL live; demo login works in a clean profile. https://fieldnote-c28dc.web.app → **Try the demo** (anonymous
  guest, no password). Verified in fresh Playwright Chrome profiles (3/3 runs) and in the user's Chrome Guest profile.
- [x] Triage on-device in dev Chrome; cloud in clean profile; badge correct in both. User's Chrome (Gemini Nano):
  **On-device (this browser) · 6.8 s · $0**, "Photo never left this computer", no cloud prompt. Fresh Chrome without the
  model: "Send this photo to cloud AI?" → **Cloud** badge (Playwright 3/3; browser pane Cloud · 1.9 s, Rheem 45 matched).
- [x] Ledger shows events from both iOS and web (iPhone 45 · web 42 rows in the 7-day view at the time of the check).
- [x] Lighthouse accessibility ≥ 90 on dashboard and triage: **100** on dashboard, triage, sign-in, status and about
  (signed-in pages audited with a persisted demo session). axe (WCAG 2.1 A/AA): 0 serious/critical issues on every page,
  light and dark.

## Checkpoint report
- **Hosted URL:** https://fieldnote-c28dc.web.app (Firebase Hosting; `index.html` and routes no-cache, hashed assets immutable).
- **Clean-profile result:** demo sign-in, dashboard, cloud triage (after the confirm dialog), ledger and job detail all work
  through production App Check (reCAPTCHA Enterprise). `/status` explains how to turn on Chrome's built-in AI.
- **Issues found and fixed during the phase:**
  - App Check auto-refresh exchanged a reCAPTCHA token on page load; brand-new browsers scored < 0.5, got a 403, and the SDK
    paused cloud AI there for a day (the testing instructions send judges to `/status` first). Now tokens are on demand
    (first AI call or data after "Try the demo"), `/status` checks only on "Check now", rejections are explained in plain words.
  - Firebase Hosting cached `index.html` for an hour, so a deploy didn't reach returning visitors: now no-cache.
  - Triage parts came from the model's guess even when the pack matched: now from the pack's own outcomes.
  - Gemini Nano read the synthetic Goodman display as "888" (dim unlit segments drawn behind every digit): samples
    re-rendered with near-black unlit segments, triage prompt v2 ("read only the brightly lit segments"). The cloud
    model read both versions correctly. **On-device retest of the new sample pending (user).**
  - Layout: right-column cards stretched to the left column; card footers inset; a ledger scroll area not
    keyboard-focusable (axe). All fixed.
- **Deviations / open:**
  - HEIC photos aren't converted in the browser; the page explains how to send a JPEG (Chrome can't decode HEIC natively;
    a converter adds ~1 MB). Revisit in P7 if time allows.
  - App Check `minValidScore` left at the default 0.5 (lowering to 0.3 for judging was offered, not chosen).
  - Main JS bundle 295 kB gzipped (Firebase SDK): code-split in P7.
  - Compiling manuals needs a dispatcher account; guests review published packs instead (testing instructions updated).
