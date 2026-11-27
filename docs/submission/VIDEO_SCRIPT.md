# Fieldnote demo video: script, shot list and setup

**Length:** 2:50 target, hard stop before 3:00 (only the first 3:00 are judged).
**Story:** one real fault, end to end. A customer's furnace shows **EE0** (ignition lockout). The
dispatcher triages the photo in Chrome, the technician diagnoses it in a basement with no signal,
finds a bird's nest in the exhaust pipe, and the report is written when signal returns. Then: where
the fix packs come from, how routing works, and what was measured.
**Rule of thumb:** a judge watching with the sound off must get "offline AI on the phone, cloud when
it helps" by 0:30. Burn in captions.

All app footage is real and unedited apart from cuts: real iPhone, real Chrome, real model calls. The
furnace display is a prop (the fault can't be triggered safely on a real furnace), and a caption says so.

---

## 1. The script

VO = voice-over (read at a calm pace, about 150 words a minute). CAPTION = burned-in text (short;
captions carry the story with the sound off). Times are targets; trim pauses in the edit.

| # | Time | Shot (what's on screen) | CAPTION | VO |
|---|---|---|---|---|
| 1 | 0:00–0:08 | B-roll: walking down basement stairs toward the furnace, phone in hand. Cut to the iPhone screen: Control Center, **airplane mode on**, no Wi-Fi. | Furnaces live where phones lose signal. | "Furnaces live in basements, and basements are where phones lose signal. Most AI assistants stop working at the top of the stairs." |
| 2 | 0:08–0:18 | Title card: Fieldnote mark + "HVAC diagnosis with zero bars". Under it: "Firebase AI Logic hybrid · iPhone + Chrome". | The cloud teaches. The phone does. | "Fieldnote is a diagnostic copilot for HVAC technicians. The cloud turns manuals into fix packs, and the phone's own AI walks the technician through the fix." |
| 3 | 0:18–0:32 | **Chrome**, Photo triage: the customer's photo of the furnace display (EE0) → **Analyze photo** → green **On-device** badge → "EE0 · Ignition lockout", verified against the Goodman fix pack, parts to bring. | 8:40 AM · Gemini Nano in Chrome reads the customer's photo, on this laptop | "Before the truck rolls, the customer texts a photo. Chrome's built-in Gemini Nano reads it right in the browser, so the photo of their home never leaves, and Fieldnote checks the code against the manufacturer's fix pack." |
| 4 | 0:32–0:46 | **iPhone** (screen recording, airplane mode): Today → R. Okafor (Urgent) → **Scan nameplate** → **Take a photo** of the printed nameplate → "Goodman fix pack matched" → **Use this equipment** → **Enter fault code** → tap **EE0** → **Start diagnosis**. Intercut 2 s of the display prop flashing EE0. | 9:05 AM · No signal. The fix pack is already on the phone. | "In the basement: no signal. The tech scans the nameplate with Apple Vision, enters the code on the display, and the right fix pack is already on the phone." |
| 5 | 0:46–1:06 | Type "gas is on at the meter and the water heater lights fine" → send → card: the note in quotes, **Read as Gas supply ok**, **On-device · 0.7 s · $0** → next step slides in. Type "switch clicks normally, drain tubes are clear" → **Read as Normal**, on-device. | Apple's on-device model, through Firebase AI Logic · under a second · $0 | "Instead of digging through menus with gloves on, the tech types what they see. Apple's on-device model, called through Firebase AI Logic, matches the note to one of the manual's answers in under a second, with no signal and no cost. It never invents a step, and code checks every answer." |
| 6 | 1:06–1:16 | Type "wait I smell gas near the burners" → full-screen red **STOP · Possible gas leak**, "You wrote …", "Raised by Fieldnote's safety rules in code, before any AI". (Haptic.) Tick the box → Continue. | Safety stops are code, not AI | "Safety isn't left to a model. A gas smell stops the job in code, before any AI runs, and the model can't skip it." |
| 7 | 1:16–1:32 | Fast: "igniter looks good, no cracks, lined up right" → Good; "sensor rod is shiny, no coating" → Clean; "found a bird nest in the exhaust pipe outside" → **Probable fix: flue piping blocked**, the summary line "5 notes understood, 5 on this iPhone · 1 safety stop". Tap **Create customer report** → "No signal. Drafting the report on this iPhone…" → **On-device draft**. | Found it: a bird's nest in the exhaust · report drafted on the iPhone | "A bird's nest in the exhaust pipe. Still offline, the iPhone drafts the customer report itself." |
| 8 | 1:32–1:46 | B-roll walking up the stairs. iPhone: airplane mode **off** → Synced → the report switches to **Cloud** on its own → **Send to customer** share sheet. | Back in signal: Gemini rewrites the report | "Back upstairs, everything syncs, and Gemini in the cloud rewrites the report automatically, ready to send to the customer." |
| 9 | 1:46–2:04 | **Chrome**, Fix packs (dispatcher): Compile a manual → Goodman manual, pages 46–49 → **1. Read fault code index** → codes table → tick EE0 → **2. Compile 1 selected code** → OK · a few s → the review tree with its manual pages. | The cloud teaches: Gemini compiles the manual into a fix pack, a person reviews it | "Where do fix packs come from? In the office, Gemini in the cloud reads the manufacturer's PDF, which the phone can't do, and compiles each fault code into a decision tree that's validated in code and reviewed by a person before it goes to every phone." |
| 10 | 2:04–2:20 | **Chrome**, Jobs → R. Okafor: the field session, step by step, each note with its On-device badge, the safety stop, the report versions. Then **Hybrid ledger**: on-device vs cloud chart, Diagnosis notes almost all green. | Every AI call is logged: where it ran, how fast, what it cost | "The dispatcher sees exactly what happened in the field, and the hybrid ledger shows where every AI call ran: diagnosis on the device, compiling and reports in the cloud." |
| 11 | 2:20–2:36 | (Optional, cut first if long) Firebase console → Remote Config → `route_diagnosis` → `only_in_cloud` → Publish. iPhone: pull to refresh on Today, send a note → badge turns **Cloud**. Then the console's **How it works → Measured** table. | Routing lives in Remote Config · measured on 24 scenarios | "Routing lives in Remote Config, so it changes without an app release. And it's measured: on the same 24 scenarios, on-device and cloud both accepted zero wrong answers." |
| 12 | 2:36–2:50 | End card: mark, "Fieldnote", the console URL, the GitHub URL, a row of product names: Firebase AI Logic · Apple Foundation Models · Gemini Nano · Gemini · App Check · Remote Config · Firestore · Auth · Hosting. | fieldnote-c28dc.web.app · try the demo | "Fieldnote. The cloud teaches, the phone does." |

Prop caption: during shots 3–4, add a small corner caption: *Furnace display is a prop. Fault simulated for the demo.*

**If you're over 2:55:** cut shot 11 first (keep 2 s of the Measured table), then shorten shot 9 to the
index table and one compiled code, then speed up the typing in shot 7 (2×).

---

## 2. Props

- **Furnace display:** open https://fieldnote-c28dc.web.app/props/display.html?code=EE0 on a spare
  phone, tablet or the laptop, full screen, brightness up. Set its Auto-Lock to Never. Put it where
  the furnace's control board would be, in front of the cabinet. **Don't open the furnace.**
- **Nameplate:** print `content/samples/nameplate-gmvc96.png` (fictional serial) and tape it to the
  cabinet or a box next to the display. No printer: show it full screen on another device.
- **Your real furnace** is the set: real pipes, cabinet and basement light. Keep its own nameplate
  and brand logo out of close-ups (the real serial number, and no third-party logos in the video).
  Don't touch the gas valve, vent or burners for any shot.
- **Customer photo (shot 3):** either the "Goodman display" sample on the triage page, or a real photo
  of the prop display taken with your phone and dropped onto the page. Test the real photo in the
  rehearsal first; if it misreads, use the sample.

## 3. The day before or morning of filming

**Tell Claude "reset the demo day"** first. It runs `cd web && npm run seed -- --only=jobs --reset`:
today's jobs scheduled for today, earlier sessions and reports cleared, so the console shows only
what you film.

**iPhone**
1. Settings → Apple Intelligence & Siri: on, model downloaded. Display & Brightness → Auto-Lock: Never.
2. Focus → Do Not Disturb on (no notifications in the recording). Battery above 50%.
3. Control Center: make sure **Screen Recording** and **Airplane Mode** are there.
4. On Wi-Fi, open Fieldnote → pull to refresh on Today → open **R. Okafor** once (caches the job and
   warms the model) → back to Today.
5. Rehearse shots 4–8 once start to finish with these exact notes (they passed on-device every time):
   1. gas is on at the meter and the water heater lights fine
   2. switch clicks normally, drain tubes are clear
   3. wait I smell gas near the burners  → STOP → tick the box → Continue diagnosis
   4. igniter looks good, no cracks, lined up right
   5. sensor rod is shiny, no coating
   6. found a bird nest in the exhaust pipe outside
   Avoid hedges ("maybe", "I think"): the app asks on purpose when a note is unsure. If a note
   ever asks anyway, tap the right answer and keep going; it still reads well on camera.
6. After the rehearsal, tell Claude "reset the demo day" again so the filmed run is the only one.

**Mac**
1. Chrome (your normal profile, which has Gemini Nano): open http://localhost:5173/status (or the
   hosted console) and click **Test the on-device model**; it should say On-device. Hide the bookmarks bar
   (⇧⌘B), close other tabs, zoom 110%.
2. For shot 9 you need a dispatcher: ask Claude to start the dev server, open http://localhost:5173,
   click **Dev: demo dispatcher**. For shots 3 and 10 the hosted console works (**Try the demo**).
3. Screen recording: ⇧⌘5 → Record Selected Portion around the Chrome window, or QuickTime → New
   Screen Recording. 1080p or higher.

## 4. Filming order (fastest)

1. **Basement, iPhone screen recording on** (Control Center → Screen Recording → start), airplane
   mode on: shots 4 → 8 in one continuous take. Stop recording after the report turns Cloud and the
   share sheet opens. Do 2 takes.
2. **B-roll with the iPhone camera** (screen recording off): walking down the stairs (5 s), the
   prop display flashing EE0 (5 s), your hands typing on the phone near the furnace (5 s), walking up
   the stairs (5 s). Landscape, steady, lights on.
3. **Mac:** shot 3 (triage), shot 10 (job + ledger, after the iPhone run has synced), shot 9
   (compile; don't publish, stop at the review), shot 11's Measured table.
4. **Optional shot 11 routing flip:** Firebase console → Remote Config → `route_diagnosis` →
   `only_in_cloud` → Publish. On the iPhone (online), pull to refresh on Today, open the job, start a
   diagnosis, send a note: the badge says Cloud. **Then tell Claude to restore Remote Config** (it
   redeploys the template from the repo, which puts `prefer_on_device` back).
5. Voice-over last, in a quiet room (QuickTime → New Audio Recording, or Voice Memos), reading the VO
   column while watching the cut.

## 5. Editing (iMovie, CapCut or DaVinci Resolve)

- Order as in the table; jump-cut waiting time (model loading, typing) but never cut inside an AI
  answer, so the badge latency on screen stays honest.
- Captions: burned in, large, bottom third, white on a dark bar. Also upload an English `.srt` to
  YouTube.
- Music: low, from the YouTube Audio Library (no copyrighted tracks).
- Zoom in (Ken Burns) on the badge in shot 5 and on "You wrote…" in shot 6 so they're readable on a
  phone.
- Export 1080p (or 4K), H.264.
- Watch it once on a phone with the sound off. If the story isn't clear from the captions, fix the
  captions.

## 6. YouTube upload

- **Title:** Fieldnote: HVAC diagnosis with zero bars (Firebase AI Logic hybrid, iOS + Web)
- **Visibility:** Public. Language: English. Captions: upload the `.srt`.
- **Description:**
  > Fieldnote is an offline-first diagnostic copilot for HVAC technicians, built for #BuildHybridAI
  > with Firebase AI Logic hybrid inference. On the iPhone, Apple's on-device model understands the
  > technician's notes with no signal; in Chrome, Gemini Nano reads customers' photos in the browser;
  > in the cloud, Gemini compiles manuals into fix packs and writes customer reports.
  > Try it: https://fieldnote-c28dc.web.app · Code: https://github.com/anshsahny/Fieldnote
  > The furnace display in the video is a prop; the fault was simulated for the demo.
  > 0:00 No signal · 0:18 Photo triage in Chrome · 0:32 Diagnosis on the iPhone · 1:06 Safety stop ·
  > 1:32 Back online · 1:46 Compiling a manual · 2:04 Ledger · 2:20 Routing and results

## 7. After filming

Tell Claude: "filming done". It will restore Remote Config if you flipped it, check the console shows
the filmed session, and move on to P8 (edit support, Devpost draft).
