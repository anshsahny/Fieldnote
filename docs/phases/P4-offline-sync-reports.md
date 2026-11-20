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
- [ ] The airplane-mode script above passes twice in a row.
- [ ] Report shows the generating model for each version.
- [ ] No data loss after app kill while offline.

## Checkpoint report
- End-to-end time offline job → synced report: …
- Issues: …
