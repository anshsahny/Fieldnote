# P1 — Hybrid spikes (Wed Nov 18 PM – Thu Nov 19) · ends with GO/NO-GO

**Goal:** prove every risky platform capability with the smallest possible code, on real hardware. Nothing pretty. These spikes become the AI service layers.

## Spike A — Web hybrid (Chrome)
1. `web/src/ai/firebase.ts`: init app, App Check (reCAPTCHA Enterprise; `self.FIREBASE_APPCHECK_DEBUG_TOKEN` on localhost), `getAI(app, { backend: new GoogleAIBackend() })`.
2. `web/src/ai/hybrid.ts`: factory `makeModel(feature)` reading the route from Remote Config:
   ```ts
   // indicative — verify against current docs
   getGenerativeModel(ai, {
     mode: InferenceMode.PREFER_ON_DEVICE,
     inCloudParams: { model: rc.cloud_model_fast },
     onDeviceParams: { createOptions: { expectedInputs: [{ type: "text" }, { type: "image" }] } },
   });
   ```
   Call the documented on-device init (`initializeDeviceModel()` or current equivalent) on a user click before the first prompt.
3. Debug page `/spike`: (a) text prompt, (b) text + JPEG prompt, (c) structured output with a JSON schema. Show `response.inferenceSource` and latency for each.
4. Repeat with `ONLY_IN_CLOUD` to confirm the cloud path and App Check.

## Spike B — iOS hybrid
1. `FirebaseApp.configure()`, App Check `AppCheckDebugProviderFactory` (debug token from the Xcode console → add in Firebase console).
2. `AIService.swift`:
   ```swift
   // indicative — verify against current docs
   let ai = FirebaseAI.firebaseAI(backend: .googleAI())
   let cloud = ai.geminiModel(name: rc.cloudModelFast)
   let system = FirebaseAI.SystemLanguageModel.default
   let onDeviceFirst = HybridModel(primary: system, secondary: cloud)
   let cloudFirst = HybridModel(primary: cloud, secondary: system)
   // new session per single-turn request
   let session = ai.generativeModelSession(model: onDeviceFirst)
   let r = try await session.respond(to: prompt)
   let source = r.rawResponse.modelVersion // "apple-foundation-models-system-language-model" = on-device
   ```
3. Show `SystemLanguageModel.default.availability` reason on a debug screen.
4. **Structured output on-device:** try the SDK's structured output for a small schema `{choice, confidence, say}`. If unsupported/flaky, implement a robust fallback: prompt for JSON only, parse, validate, one retry with the error message. Record which path works.
5. **Native function calling on-device (stretch probe, 30 min max):** define one tool `lookupFaultCode(code)`. Record whether it works through the hybrid session. Don't depend on it.
6. **Vision OCR:** `VNRecognizeTextRequest` (or `DataScannerViewController`) on a photo of a printed nameplate (print a sample from any furnace manual image search; we'll replace it later). Extract text lines.
7. Airplane mode on the iPhone → the same prompt still answers on-device. Then disable Apple Intelligence temporarily (or force `primary: cloud`) to confirm the cloud fallback.

## Spike C — Firestore offline (iOS) sanity
Write a doc offline, kill and relaunch the app, reconnect, confirm it syncs. (Firestore iOS offline persistence is on by default.)

## Automated tests
- Web: unit test for `makeModel` mode mapping from Remote Config values (mock `firebase/ai`).
- iOS: unit test for JSON parse/validate fallback with good, malformed, and out-of-enum payloads.

## GO/NO-GO criteria (all must be ✅ by end of Thu)
- [x] iOS on-device answer confirmed on the real iPhone via `modelVersion` (`apple-foundation-models-system-language-model`).
- [x] iOS structured output (native or fallback) returns valid `{choice, confidence, say}` ≥ 9/10 tries: native `@Generable` 10/10 online + 5/5 in airplane mode.
- [x] Vision reads brand + model from the printed nameplate (photographed with the iPhone camera; see note).
- [x] Chrome `inferenceSource == ON_DEVICE` for text **and** text+image (8/8 runs).
- [x] Cloud path works on both platforms with App Check enforced.
- [x] Airplane-mode on-device answer on the iPhone (6/6 rows on-device).

If iOS on-device fails and can't be fixed by Fri noon → stop and tell the user; we pivot.

**Verdict: GO** (Fri Nov 20, ~5:45 PM ET, about a day behind the schedule's Thu gate).

## Checkpoint report (filled in 2026-11-20)
Devices: iPhone "Duo" (iPhone19,4) on iOS 27.2.1 · Chrome 157 (Gemini Nano, text + image available) ·
iPhone 17 Simulator iOS 27.2 on the M4 Mac. SDKs: firebase JS 13.4.0, firebase-ios-sdk **12.19.3**.

| Capability | Result | Latency | Notes |
|---|---|---|---|
| Web text on-device | ✅ ON_DEVICE (prefer + only on-device) | 3.6 s (17.6 s first, cold) | Job summary prompt |
| Web image on-device | ✅ ON_DEVICE | 3.3–5.7 s | Synthetic customer photo; read the 3-flash code. Text+image → JSON 4.2 s |
| Web structured on-device | ✅ ON_DEVICE | 3.8 s | `promptOptions.responseConstraint`; choice "does not run", conf 0.95 |
| Web cloud path | ✅ IN_CLOUD with App Check (limited-use tokens) | 3.8–17 s | In a browser without Nano, `prefer_on_device` fell back to the cloud: 4/4 pass |
| iOS on-device text | ✅ ON_DEVICE on iPhone | 4.8 s online · 0.6–1.4 s offline | Nameplate fields from OCR text via `HybridModel(system, cloud)` |
| iOS structured | **native** `@Generable` 10/10 (+5/5 offline); JSON fallback 3/3 | 1.56 s avg (0.77 s offline) | Choice validated in code against the step's allowed keys |
| iOS native tools | **works** on-device | 0.64–0.76 s | FoundationModels `Tool` passed to `generativeModelSession(tools:)`; tool really called with "3" |
| iOS cloud path | ✅ IN_CLOUD with App Check | 21.6 s on iPhone, 3.9 s Simulator | Slow on the phone's network; see open issues |
| iOS cloud-first offline | ✅ fell back to ON_DEVICE | 0.58 s | `prefer_in_cloud` in airplane mode (customer report route) |
| Vision OCR | ✅ | 0.07–0.25 s on iPhone | Sample image + camera photo of the nameplate (shown on a Mac screen; no printer) |
| Offline sync | ✅ (Simulator) | — | `disableNetwork` → write → app killed → relaunch: doc still in local cache (pending) → reconnect → on server (verified server-side) |

**Findings**
- firebase-ios-sdk **13.0.0 removed** `HybridModel` / `SystemLanguageModel` / `GenerativeModelSession`; the hybrid docs
  still describe the 12.13+ API. We pin 12.19.3 (see Decision log).
- On the **Simulator**, Apple's on-device safety guardrail fails for some prompts (`operationNotAllowed: Simulator is
  not supported`) and the SDK falls back to the cloud. Not an issue on the iPhone.
- The iPhone first reported `modelNotReady`; it cleared once Apple Intelligence finished preparing the model. The app
  must surface this state (P3/P6), and the hybrid fallback already covers it.
- Native on-device function calling works through the hybrid session → cut-list item 3 is no longer a risk.

**Open issues**
- Cloud latency on the iPhone (21.6 s; earlier 34–102 s with timeouts while the phone auto-locked) vs 4–5 s on the
  Simulator. Investigate in P4/P6 (network, limited-use App Check token per request, app suspension).
- Spike C ran on the Simulator with `disableNetwork`; a real airplane-mode Firestore pass happens in P4.

**Reproduce**
- Web: `cd web && npm run dev` → http://localhost:5173/spike (dev builds only) → Run all, per mode.
- iOS (Simulator or device): launch with `-FNRunSpikes all` or `-FNRunSpikes offline` (plus `-FNExitWhenDone YES`);
  results print as `FNSPIKE {json}` lines. Device example:
  `xcrun devicectl device process launch --device <udid> --console com.anshsahny.fieldnote -- -FNRunSpikes all -FNExitWhenDone YES`.
- Firestore offline: `-FNOfflineStep write`, then `-FNOfflineStep verify` (the user needs a seeded `users/{uid}` profile).
