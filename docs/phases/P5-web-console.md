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
- [ ] Hosted URL live; demo login works in a clean profile.
- [ ] Triage on-device in dev Chrome; cloud in clean profile; badge correct in both.
- [ ] Ledger shows events from both iOS and web.
- [ ] Lighthouse accessibility ≥ 90 on dashboard and triage.

## Checkpoint report
- Hosted URL: …
- Clean-profile result: …
