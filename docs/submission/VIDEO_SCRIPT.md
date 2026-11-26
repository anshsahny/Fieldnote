# Demo video script — target 2:50 (only the first 3:00 are judged)

Rule of thumb: the judge must understand the product and the hybrid idea by 0:30, even with sound off.

| Time | Shot | On screen / caption | Voice-over (short) |
|---|---|---|---|
| 0:00–0:08 | Walking down basement stairs, phone status bar: **No Service** | "Most furnaces live where phones don't work." | "Most furnaces live where phones don't get signal." |
| 0:08–0:25 | Display prop flashing **EE0**; tech scans the printed Goodman nameplate (pack matched); types **EE0**; first step appears | "Fieldnote: diagnosis with zero bars." | "Fieldnote reads the nameplate and the fault code, and the phone's own AI walks the diagnosis. No internet needed." |
| 0:25–0:45 | Types "gas is on at the meter and the water heater lights fine" → next step, green **On-device · 0.7 s · $0** badge; then "switch clicks normally, drain tubes are clear" → next step | "Apple Foundation Model via Firebase AI Logic" | "Plain-language notes are interpreted on-device, against a validated fix pack, so it never makes up steps." |
| 0:45–0:55 | Types "wait I smell gas near the burners" → red safety stop (haptic) | "Safety stops are code, not AI." | "Safety stops are enforced in code. The model can't skip them." |
| 0:55–1:05 | Title card: problem stats | "110,000-technician shortage · 5 retiring for every 2 entering" | "The industry is short of experienced techs, and newer ones need help in the moment." |
| 1:05–1:30 | Web console: upload manual PDF → cloud compiles → review → publish | "The cloud teaches: manuals → fix packs (Gemini, cloud-only: PDFs)" | "In the office, the cloud model does what the phone can't: reads the manufacturer's PDF and compiles a compact fix pack." |
| 1:30–1:50 | Back upstairs: signal returns, "Synced ✓", report upgrades from on-device draft to cloud version | "Back online: cloud writes the customer report" | "Back in signal, the job syncs and the cloud writes the customer report." |
| 1:50–2:10 | Web triage: customer photo → **Chrome Gemini Nano, image input, on-device** → likely fault + parts | "Photos of customers' homes stay in the browser" | "Before dispatch, Chrome's on-device Gemini Nano reads the customer's photo, so the right part goes on the truck." |
| 2:10–2:25 | Flip a Remote Config route → badge switches to Cloud live; Hybrid Ledger charts | "Routing lives in Remote Config · every call is logged" | "Routing is controlled in Remote Config, and the ledger shows how much ran on-device." |
| 2:25–2:40 | Eval table + routing table (README) | "On-device vs cloud, measured on 24 scenarios" | "We measured on-device against cloud on real scenarios." |
| 2:40–2:50 | Logo, URLs, "iOS + Web · Firebase AI Logic · App Check · Firestore · Remote Config · Auth · Hosting" | | "Fieldnote. The cloud teaches, the phone does." |

Production notes: 1080p+, captions burned in, music low, no copyrighted music (use YouTube Audio Library), real device footage for iOS (rule: "must show the project running on its intended platform").

## Filming kit (P7)

**Flow to film: Goodman EE0.** The iPhone eval ran each of these notes on-device in 0.6–0.8 s,
all read right. Type them as written (small wording changes are fine; avoid hedges like "maybe", which
make the app ask on purpose):

1. Scan the printed nameplate → "Goodman fix pack matched". Code: **EE0**.
2. "gas is on at the meter and the water heater lights fine" → *gas supply ok*
3. "wait I smell gas near the burners" → **safety stop**. Tick the confirm box → continue.
4. "switch clicks normally, drain tubes are clear" → *normal*
5. "igniter looks good, no cracks, lined up right" → *good*
6. "sensor rod is shiny, no coating" → *clean*
7. "found a bird nest in the exhaust termination" → conclusion (blocked vent). Tick "I completed this
   repair" only if the shot needs it → **Finish job** (on-device report draft while offline).
8. Airplane mode off → "Synced" → the report upgrades to the cloud version on its own.

**Props**
- Nameplate: print `content/samples/nameplate-gmvc96.png` (fictional serial), tape it to a box.
- Display: open https://fieldnote-c28dc.web.app/props/display.html?code=EE0 on a spare phone with
  Auto-Lock off, inside the box. Blinking-LED alternative (Carrier): `?led=31`.

**Before filming**
- Reset the demo day: `cd web && npm run seed -- --only=jobs --reset` (clears earlier sessions and reports).
- iPhone: Debug build from this Mac (re-signed Nov 26, valid 7 days); Apple Intelligence on; open the
  job once with signal so the packs and the job are cached; then airplane mode.
- Screen recording: Control Center → Screen Recording (iPhone); QuickTime or OBS for the console at
  1080p, Chrome zoom 110%.

