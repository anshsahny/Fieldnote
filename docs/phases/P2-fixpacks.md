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
- [ ] 3 published packs in Firestore, each ≥ 6 fault codes with step trees.
- [ ] Every pack passes the validator on web **and** iOS (shared fixtures).
- [ ] Sources listed in `content/sources.json`; no PDFs in git.
- [ ] Demo jobs seeded.

## Checkpoint report
- Packs: brand / codes / steps / size KB
- Compiler calls used and any rate-limit issues
- Demo unit: identified? brand/model
