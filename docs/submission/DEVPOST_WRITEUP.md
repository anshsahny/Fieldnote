# Devpost write-up (paste section by section)

## Project name
Fieldnote

## Tagline (≤ 200 chars)
HVAC diagnosis with zero bars: the cloud turns manuals into fix packs, and the phone's own AI walks the technician through the fix. Firebase AI Logic hybrid on iOS + Web.

## Inspiration
Furnaces live in basements and mechanical rooms, exactly where phones lose signal. The manual is a
long PDF that won't download there, and the technician is often new: the U.S. Bureau of Labor
Statistics projects about 40,600 HVAC technician openings a year and 11% growth through 2035, "much
faster than average". Cloud AI assistants stop working at the top of the basement stairs. I wanted
the AI to come down the stairs with the technician.

## What it does
**For the technician (iPhone, offline-first).** Scan the nameplate (Apple Vision OCR) to pick the right
fix pack, enter the fault code on the display, and follow the steps. Instead of hunting for the right
button with gloves on, the tech types what they see in plain words, like "switch clicks normally,
drain tubes are clear". The **Apple Foundation Model on the iPhone, through Firebase AI Logic**, maps
the note to one of the step's answers in about 0.7 seconds, for $0, with no signal. Every answer shows
what was read and where it ran (`On-device · 0.7 s · $0`), with one-tap undo. Typing "wait, I smell
gas" stops everything with a full-screen safety stop, raised by code before any model call. When
signal returns, the session syncs and the cloud writes the customer report, which the tech sends from
the phone.

**For the dispatcher (Chrome).** Upload a manufacturer's manual: **Gemini in the cloud** compiles the
troubleshooting pages into a validated **fix pack** (fault codes, causes, step-by-step checks, safety
stops, manual page references), which a person reviews and publishes to every tech's phone. Before
dispatch, **Chrome's on-device Gemini Nano with image input** reads the customer's photo of the furnace
display, verifies the code against the fix pack, and lists the parts to bring, so the photo of
someone's home never leaves the browser. A **Hybrid Ledger** shows where every AI call ran, how fast,
and what it would have cost in the cloud.

## How I built it: how Firebase AI Logic is used
The core rule: **the cloud teaches, the phone does.** A big cloud model reads the manufacturer's PDF once and
compiles a compact decision tree. A small on-device model only has to map plain words to one of a few
allowed answers, which small models do well, and code checks every answer.

| Feature | Platform | Firebase AI Logic mode | Why |
|---|---|---|---|
| Diagnosis notes | iOS | `HybridModel(primary: SystemLanguageModel, secondary: Gemini)` | Offline, ~0.7 s, $0 |
| Customer report | iOS | `HybridModel(primary: Gemini, secondary: SystemLanguageModel)` | Better long-form in the cloud; on-device draft offline, upgraded on reconnect |
| Nameplate disambiguation | iOS | On-device first | Tiny prompt; serial numbers are never sent |
| Photo pre-triage (text + image) | Web | `PREFER_ON_DEVICE` (Gemini Nano) | Customers' photos stay in the browser |
| Manual PDF → fix pack | Web | `ONLY_IN_CLOUD` | PDF input is cloud-only; done once per model |
| Safety stops, fault-code lookup, pack validation | Both | Code | Never delegated to a model |

- **Three tiers, never a dead end:** on-device first, cloud when it helps, and the plain fix pack with
  tap answers when no model is available.
- **Structured output everywhere:** `@Generable` on iOS, JSON schema / `responseConstraint` on web; the
  model's choice is validated against the step's allowed answers. Hedged or low-confidence notes
  become a one-tap question instead of a guess.
- **Remote Config** holds every route, the cloud model names, prompt versions and the confidence
  threshold, so routing changes without an app release. **App Check** (limited-use tokens; reCAPTCHA
  Enterprise on web, App Attest / debug provider on iOS) protects every Gemini call. **Firestore**
  offline persistence carries packs, jobs, sessions and reports through dead zones; sessions resume
  after the app is killed. **Authentication** scopes data per shop and powers the one-click demo
  guest. **Hosting** serves the console.
- **One source of prompts** (`shared/prompts/*.md`, versioned) bundled into the iOS app and imported by
  the web app; the same safety rules run on both platforms against shared test cases.
- Built with Claude Code and the official **Firebase Agent Skills** (AI Logic, Remote Config, Firestore,
  rules authoring and auditing, Hosting), plus the Firebase MCP server for seeding and checks.

## Results (measured, not asserted)
24 scenarios, 64 technician notes (clean, messy, hedged, safety, trade knowledge), same prompt and code
checks on every route:

| Route | Clear notes read right | Wrong answers accepted | Asked when unsure | Safety stops (code) | Median |
|---|---|---|---|---|---|
| iPhone · on-device | 54/56 | **0** | 4/4 | 4/4 | 0.65 s |
| iPhone · cloud | 56/56 | **0** | 4/4 | 4/4 | 0.93 s |
| Chrome · on-device (Gemini Nano) | 56/56 | **0** | 4/4 | 4/4 | 3.4 s |
| Chrome · cloud | 56/56 | **0** | 4/4 | 4/4 | 1.2 s |

Zero wrong answers on every route. The two iPhone misses are safe ones: one note asked the tech, and
one tripped Apple's on-device safety filter (the app now retries on the device, then asks the cloud
when online). A full diagnosis in airplane mode ran every note on the iPhone.

## Challenges I ran into
- **The hybrid API moved under me.** firebase-ios-sdk 13.0 removed `HybridModel` / `SystemLanguageModel`,
  so the iOS app pins 12.19.3, the last release with Firebase AI Logic's on-device path.
- **Small-model limits.** iOS on-device has no image input, so Apple Vision OCR reads the nameplate first.
  The on-device context is 4,096 tokens, so each request carries only the current step's slice of the
  pack (about 650–750 tokens).
- **Small models agree too easily.** A hedged note ("vent might be ok") advanced at 0.60 confidence. The
  fix is code: hedge words always trigger a tap confirmation, and the confidence threshold (0.8) lives
  in Remote Config, set from the eval.
- **Trade knowledge.** Gemini Nano read "handle perpendicular to the pipe" as "valve on" (it means off).
  I added the fact to the fix packs instead of tuning the prompt to the test, and the next run was 56/56.
- **Guardrails on trade words.** Apple's on-device filter sometimes rejects "termination looks right"
  (a vent termination). One on-device retry, then the cloud when online, then a tap.
- **Free tier and first calls.** Cloud eval runs are paced under the 15 requests/minute limit; prewarming
  the on-device model when a job opens cut the first answer from up to 15 s to about 1–2 s.

## Accomplishments that I'm proud of
- A complete diagnosis in airplane mode on a real iPhone: every note understood on the device, safety
  stop in code, and the report rewritten in the cloud the moment signal returned.
- Zero wrong answers accepted in all six runs (iPhone, Simulator and Chrome; on-device and cloud) on the
  same 24 scenarios.
- The model never invents a step: every instruction comes from a manual page a person reviewed.

## What I learned
On-device models are good at narrow, well-framed choices and fast enough to feel instant, but the
product has to be designed around their failure modes: let code own facts and safety, make every AI
answer visible and undoable, and ask when unsure. Measuring both routes on the same scenarios was
the only way to know what to tune.

## What's next
Pilot with a local HVAC shop; more brands and heat pumps (the refrigerant transition is creating new
fault codes); offline dictation for gloved hands; integration with field-service software.

## Built during the submission period
New project, started Nov 18, 2026. No pre-existing code. Open-source libraries: Firebase SDKs,
React, Vite, zod, pdf-lib, lucide icons (see package manifests).

## Built with
firebase, firebase-ai-logic, gemini, gemini-nano, apple-foundation-models, swift, swiftui, apple-vision,
react, typescript, vite, firestore, remote-config, app-check, firebase-auth, firebase-hosting, claude-code
