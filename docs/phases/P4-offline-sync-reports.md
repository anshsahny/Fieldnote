# P4 — Offline, sync, reports (Tue Nov 24)

**Goal:** the "basement → back in signal" story works end to end, and the dispatcher sees the result.

## Tasks
1. **Offline data:** Firestore persistence for packs, jobs, sessions; prefetch published packs + today's jobs on launch/pull-to-refresh. "Ready offline" indicator per pack (version shown). Remote Config cached with last-fetched values.
2. **Session persistence:** every engine step writes to `jobs/{id}/sessions/{sid}` immediately (offline writes queue). Survives app kill.
3. **Report generation** (`shared/prompts/customer_report.md`): input = conclusion + steps + readings + parts (no customer PII in prompt beyond first name). Route `cloudFirst` (`HybridModel(primary: cloud, secondary: system)`).
   - Online → cloud report (plain-language summary, work performed, findings, parts, recommendations, safety notes).
   - Offline → on-device short draft, marked `draft · on-device`. When connectivity returns, offer **"Upgrade with cloud"** (auto if `rc.auto_upgrade_reports`). Keep both versions; show which model wrote each.
4. **Connectivity monitor** (`NWPathMonitor`): banner + queued-count badge; on reconnect, flush and show "Synced ✓".
5. **Dispatcher receives:** report document appears in web Reports inbox (P5 builds the UI; verify via Firestore console today).

## 👤 HUMAN checks
- Real test: airplane mode → complete a job → write draft report → kill app → reopen → disable airplane mode → report syncs and upgrades. Time it.
- **Quota decision:** any 429s so far? If yes, file the Sprint 3 quota request before **Wed Nov 25, 10:00 AM PT**. Default: skip.

## Automated tests
- Report prompt builder excludes address/phone; length bounds.
- Session state round-trips through Codable.
- Upgrade logic: draft + online → cloud call made once; failure keeps draft.

## Acceptance checks
- [x] The airplane-mode script above passes twice in a row. iPhone (user): run 1 Goodman EE0 passed every
  step. Run 2 Rheem 11 passed every step except the automatic upgrade: the first cloud call after Airplane
  Mode went off failed in 0 ms and the draft waited for a tap. Fixed (retries); run 3 Carrier 13 passed with
  the upgrade automatic. Also passed twice on the Simulator (simulated offline, two kills).
- [x] Report shows the generating model for each version: On-device draft / Cloud switch, badge with
  latency, and "Drafted on this iPhone by Apple's on-device model" / "Written in the cloud by
  gemini-3.5-flash-lite". Firestore keeps every version with `generatedBy` and `model`.
- [x] No data loss after app kill while offline: the session resumes at the saved step (after the first
  kill) and the concluded diagnosis + drafted report survive a second kill; everything synced.

## Checkpoint report
- **End-to-end time, Airplane Mode off → cloud report on screen (iPhone):** 3 s (run 1, automatic),
  9 s (run 2, needed a tap; fixed), 2 s (run 3, automatic). On-device drafts took 3.3–8.2 s with no
  signal; cloud rewrites 1.8–8.8 s (gemini-3.5-flash-lite). Queued writes reached the server within 2 s
  of reconnecting. Simulator, whole offline job → synced report: 3.5 min (mostly tapping).
- **Dispatcher side:** reports land in `orgs/demo/reports` with both versions, `status: final`,
  `upgradedAt`; sessions in `jobs/{id}/sessions` with `createdOffline: true` (checked with an admin read;
  the inbox UI is P5).
- **Issues found and fixed:**
  - First cloud call right after reconnecting fails (iOS reports the network up early). Auto-upgrade now
    waits 2 s, retries at 5/15/30 s, retries when queued writes drain, resets per reconnect.
  - Reports claimed repairs nobody confirmed ("removed the blockages"). Conclusion asks "I completed this
    repair" (fix outcomes); report prompt v2 lists it as recommended unless ticked; no "fix pack" jargon.
  - The job's diagnosis card had a small "Open" button; the whole card is the target now and opens the
    report directly.
  - Sync pill covered the navigation title; it's a top inset now.
  - Rules let any org member update any job's status; now only the assigned tech, with typed sessions
    and reports.
- **Quota decision:** skip the Sprint 3 request. The model in use (3.5 Flash-Lite) has never returned
  429; the bigger models fail on capacity (timeouts, 503s), which a quota increase doesn't fix; the hybrid
  design already degrades to on-device/plain. Revisit only if Flash-Lite returns 429 before Wed Nov 25,
  10:00 AM PT.
- **Open:** prewarm the on-device model when a diagnosis starts (first call 2–7 s); run
  `npm run seed -- --only=jobs --reset` before filming (kept the test reports for now as sample data for
  the P5 inbox).
