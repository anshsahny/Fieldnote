# Testing instructions (paste into Devpost)

**Hosted web console:** https://<project>.web.app — click **Try the demo** (or sign in with `demo@fieldnote.app` / `<demo password>`; demo data only).

**Fastest path (2 minutes):**
1. Open `/status` to see whether your Chrome can run the on-device model. Everything works either way: without it, Fieldnote falls back to Gemini in the cloud (that's the hybrid design).
2. `/triage` → pick a sample photo → see the likely fault and parts, with a badge showing **On-device** or **Cloud**.
3. `/packs` → open a published fix pack; optionally upload a sample manual page to watch the cloud compiler.
4. `/jobs` → open a completed job to see the technician's offline session and which model answered each step.
5. `/ledger` → hybrid usage across iOS and web.

**To run on-device in Chrome:** Chrome 148+ on desktop; enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, relaunch; check `chrome://on-device-internals`. The first run downloads the model.

**iOS app:** shown in the demo video on a real iPhone. To run it: clone the repo, follow README → iOS (Xcode 26+, free Apple ID signing, Apple Intelligence enabled). The Simulator works for UI; on-device AI in the Simulator needs your Mac's Apple Intelligence on, with matching macOS and Simulator versions.

The project is free to use and will stay up through the end of judging.
