# P9 — Final QA and submit (Mon Nov 30, morning)

**Submit by 12:00 PM ET. Hard deadline 5:00 PM ET (2:00 PM PT).**

## Final QA (90 min max)
1. Fresh Chrome profile, incognito: hosted URL → demo login → triage → ledger → status. Works.
2. YouTube link plays logged out; length < 3:00; captions on.
3. GitHub: public, Apache-2.0 in About, README renders, Mermaid renders, no secrets (`git log -p | grep -iE "apikey|AIza|debug"` reviewed), `.example` files present.
4. iPhone: build still signed (re-run from Xcode if near 7 days); one airplane-mode run.
5. Remote Config: production values (on-device-first routes), debug flip control hidden in prod.
6. Firestore rules deployed; demo data intact; Gemini quota fine.
7. Re-read the Devpost text once for typos and broken links.

## Submit
- Click **Submit** on Devpost. Screenshot the confirmation.
- Tag the release `v1.0-submission` on GitHub.

## Keep it working through judging (Dec 10–16)
- Do not change routes, delete data, or rotate App Check without re-testing. Avoid pushing breaking changes to `main`; work on a branch.
- Set a calendar reminder Dec 9 to check the hosted URL and quota.
