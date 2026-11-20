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
- [ ] iOS on-device answer confirmed on the real iPhone via `modelVersion`.
- [ ] iOS structured output (native or fallback) returns valid `{choice, confidence, say}` ≥ 9/10 tries.
- [ ] Vision reads brand + model from the printed nameplate.
- [ ] Chrome `inferenceSource == ON_DEVICE` for text **and** text+image.
- [ ] Cloud path works on both platforms with App Check enforced.
- [ ] Airplane-mode on-device answer on the iPhone.

If iOS on-device fails and can't be fixed by Fri noon → stop and tell the user; we pivot.

## Checkpoint report (fill in)
| Capability | Result | Latency | Notes |
|---|---|---|---|
| Web text on-device | | | |
| Web image on-device | | | |
| Web structured on-device | | | |
| iOS on-device text | | | |
| iOS structured | native / fallback | | |
| iOS native tools | works / no | | |
| Vision OCR | | | |
| Offline sync | | | |
