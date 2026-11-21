# P2 — Fix packs: schema, compiler, content (Fri Nov 20)

**Goal:** real, validated fix packs for 3 furnace families in Firestore, produced by the cloud compiler in the web console.

## 👤 HUMAN tasks
1. **Identify the demo unit by end of today.** Find any furnace/AC you can film (your building, family, friend). Photograph the nameplate (brand, model, serial) and the control-board fault-code label (usually inside the burner door). Send model + photos to Claude Code. If none: we use Goodman + printed nameplate + LED mock.
2. Pick/approve the 3 brands. Default: **Goodman (GMVC96/GMVM97 family), Carrier (59SC/59TP family), Rheem (R96V family)** — swap one for the demo unit's brand.
3. Find the public installation/service manual PDF for each (manufacturer sites). Download locally only; paste the URLs into `content/sources.json`.

## 🤖 Claude Code tasks
1. Finalize `shared/fixpack.schema.json` (PLAN §5) and mirror it as a **zod** schema (web) and **Codable + validator** (iOS). Validation rules: every `next` target exists; every fault code's `firstStep` exists; no orphan steps; safetyStops present; strings ≤ 200 chars; total pack ≤ 25 KB.
2. Compiler prompt `shared/prompts/compile_fixpack.md`: "extract facts only, paraphrase, never invent; cite page numbers; output must match the schema". Strategy: compile **per fault code** (one cloud call per code section) to keep outputs small and accurate, then assemble.
3. Web route `/packs`: upload PDF (read in browser, sent as inline data, **no Cloud Storage needed**) → `ONLY_IN_CLOUD` model `cloud_model_compile` → validate → **review screen** (table of codes, step graph, validation errors highlighted, edit-in-place JSON) → **Publish** (writes `orgs/demo/fixpacks/{packId}` with version++). Log an inference event for each call.
4. Compile the 3 packs. Human-review them with the user (Claude Code shows each code + steps side by side with the page reference). Commit the final JSON to `content/fixpacks/` (facts + paraphrase only).
5. Add universal safety stops to every pack: gas odor, CO alarm, scorching/burning smell, water near electrical, exposed wiring, flame rollout.
6. Seed script `scripts/seed.ts`: demo org, 2 users (tech, dispatcher), 5 demo jobs with fictional customers/addresses, published packs.

## Automated tests
- Validator: valid pack passes; each rule has a failing fixture.
- Compiler: mocked model output → assembled pack passes validation; malformed output → readable errors.
- Firestore rules tests with the emulator (`@firebase/rules-unit-testing`): tech can't publish; cross-org read denied.

## Acceptance checks
- [x] 3 published packs in Firestore, each ≥ 6 fault codes with step trees.
- [x] Every pack passes the validator on web **and** iOS (shared fixtures).
- [x] Sources listed in `content/sources.json`; no PDFs in git.
- [x] Demo jobs seeded.

## Checkpoint report (filled in 2026-11-21)
**Packs** (published v2 in `orgs/demo/fixpacks`, committed in `content/fixpacks/`, bundled in the iOS app):

| Pack | Codes | Steps | Size | Manual pages |
|---|---|---|---|---|
| `goodman-cvc96-mvc96-v1` (*CVC96/*MVC96, e.g. GMVC96) | 8: E11, EE0, EE1, EE2, EE3, EE5, EE6, EE7 | 62 | 21.9 KB | IOG-2015E p. 46–49 |
| `carrier-59sc5b-v1` (59SC5B) | 8: 13, 14, 22, 23, 24, 31, 33, 34 | 48 | 18.9 KB | 59SC5B-05SI p. 58–62, 69 |
| `rheem-r96v-v1` (R96V / U96V) | 7: 11, 12, 13, 22, 30, 33, 45 | 50 | 19.2 KB | 92-24161-124-08 p. 111–118 |

**Compiler calls** (Hybrid Ledger, `feature: compile`): 40 logged. 28 OK on `gemini-3.5-flash-lite` (all three packs,
~4 s/call, ~12 s/call for Carrier), 6 OK on `gemini-4-hydrogen` (~60–120 s/call), 6 failed. About 10 more
server-side errors were absorbed by the retry/backoff. Issues: Hydrogen returned frequent 500/503 and then **429
(free-tier quota exhausted)**; `gemini-3.8-flash` returned **503 "Deadline expired"** for every request, even tiny
text prompts (no published Firebase incident). Switched `cloud_model_compile` via Remote Config (no release), and
added `scripts/ai-health.mjs` to probe models from the CLI.

**Quality and review.** Index extraction read 7-segment codes correctly from the page image ("Eb1", where the PDF's
text layer says "E1"). Review edits: model patterns corrected to match real model numbers (e.g. `GMVC960803BN`);
Rheem code 12 leaf fixed (it ended in "resolved" while the fault would persist; the manual says replace the rod);
v2 pass turned 13 bare yes/no questions into descriptive options, fixed one safety stop (burner → GAS), and
shortened labels. Codes chosen per brand: the most common gas-heat faults within the 25 KB budget.

**Demo unit:** none available → Plan B: Goodman pack + printed nameplate. Note for P7: Goodman *MVC96 shows codes
on a 7-segment display (e.g. "EE2" = low-stage pressure switch not closed), not a blinking LED; a blinking-LED shot
fits the Carrier pack (code 31 = pressure switch did not close).

**Tests:** web 77/77 (validator on 16 shared fixtures, compiler with mocked model output, published packs
canonical), iOS 32/32 (same 16 fixtures + bundled packs), Firestore rules 13/13 on the emulator.
