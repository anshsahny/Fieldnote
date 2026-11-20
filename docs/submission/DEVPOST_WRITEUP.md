# Devpost write-up (template — fill numbers from real results in P6/P8)

## Tagline (≤ 200 chars)
HVAC diagnosis with zero bars: the cloud turns manuals into fix packs, and the phone's own AI walks the technician through the fix. Firebase AI Logic hybrid on iOS + Web.

## Inspiration
Furnaces live in basements and mechanical rooms, where phones lose signal. The trade is short an estimated 110,000 technicians, with five retiring for every two entering, so newer techs are often alone with an unfamiliar unit and a 60-page PDF they can't download. [cite sources]

## What it does
- **iPhone (technician):** scan the nameplate (Apple Vision OCR), enter the fault code, and follow a guided diagnosis. Plain-language notes are interpreted by the **on-device Apple Foundation Model through Firebase AI Logic**, offline and free. Safety stops are enforced in code. Back online, the job syncs and the cloud writes the customer report.
- **Web (dispatcher, Chrome):** upload a manufacturer manual, and **Gemini in the cloud** compiles it into a validated fix pack. Pre-triage customer photos with **Chrome's on-device Gemini Nano (image input)**, so photos of people's homes stay in the browser. A Hybrid Ledger shows every AI call's source, latency, and cloud cost avoided.

## How we built it — how Firebase AI Logic is used
[Routing table from PLAN §4, condensed.] Three-tier promise: on-device → cloud → plain fix pack, so the technician is never stuck. iOS uses `HybridModel` with on-device-first sessions for diagnosis and cloud-first for reports; web uses `InferenceMode.PREFER_ON_DEVICE` with image input for triage and `ONLY_IN_CLOUD` for PDF compilation. Remote Config controls routes, models, prompt versions, and thresholds. App Check protects the Gemini API (debug provider on iOS, reCAPTCHA Enterprise on web). Firestore offline persistence carries packs, jobs, sessions, and reports through dead zones. Auth scopes data per shop.
Built with Claude Code using **Firebase Agent Skills** [what they did].

## Results
[Eval table: on-device vs cloud accuracy, latency, cost on 24 scenarios, both platforms.]

## Challenges
On-device context limits (4,096 tokens on iOS) → we inject only the current step's slice of the fix pack; the model chooses among allowed next steps instead of generating instructions. iOS on-device has no image input → Vision OCR first. [real issues from the build log]

## Accomplishments
[e.g., full diagnosis in airplane mode; median on-device turn X s; zero safety-stop misses.]

## What we learned
[honest notes]

## What's next
Pilot with a local HVAC shop; more brands; heat pumps (refrigerant transition); integration with field-service software.

## Built during the submission period
New project, started Nov 18, 2026. No pre-existing code.
