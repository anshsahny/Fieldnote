# Testing instructions (paste into Devpost)

**Hosted web console:** https://fieldnote-c28dc.web.app → click **Try the demo**. No account or password: you join a fictional
demo company with read access and can run photo triage. Nothing you do can delete data.

**Fastest path (2 minutes):**
1. `/status` (works before signing in) shows whether your Chrome can run AI on-device. Everything works either way: without it,
   Fieldnote uses Gemini in the cloud, and asks before a photo leaves your browser. That's the hybrid design.
2. **Photo triage** → pick a sample photo → **Analyze photo**. The model reads the display; Fieldnote then checks the code
   against the published fix pack (facts from the manual, not the model). The badge says **On-device** or **Cloud**.
3. **Jobs** → open **R. Okafor**: the technician's offline session from a real iPhone, step by step, with which model answered
   each typed note, and the customer report drafted on the iPhone and then rewritten in the cloud.
4. **Hybrid ledger**: every model call from iPhone and web (metadata only), on-device vs cloud, latency, cost avoided.
5. **Fix packs** → **Review** a pack to see a manual compiled into a decision tree. (Compiling new manuals needs a dispatcher
   account.)
6. **How it works**: the routing table (live from Remote Config) and the measured on-device vs cloud results.

**To run on-device in Chrome:** desktop Chrome 148+; enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`,
relaunch; check `chrome://on-device-internals`. The first run downloads the model.

**iOS app:** shown in the demo video on a real iPhone. To run it: clone the repo, follow README → iOS (Xcode 26+, free Apple ID
signing, Apple Intelligence enabled). The Simulator works for UI; on-device AI in the Simulator needs your Mac's Apple
Intelligence on, with matching macOS and Simulator versions.

The project is free to use and will stay up through the end of judging.
