import Foundation

/// The real ObservationInterpreter: Firebase AI Logic hybrid session (route from Remote Config,
/// on-device first by default) with @Generable structured output, validated in code. If structured
/// generation fails, one JSON-in-text attempt; out-of-enum answers become "unclear".
nonisolated struct HybridInterpreter: ObservationInterpreter {
    let ai: AIService
    let route: InferenceRoute
    let cloudModel: String

    func interpret(_ prompt: DiagnosisPrompt.Built) async throws -> Interpretation {
        do {
            let r = try await Self.retryingGuardrail(route: route) { route in
                try await ai.respond(prompt.user, generating: DiagnosisDecision.self, instructions: prompt.system,
                                     route: route, cloudModel: cloudModel)
            }
            #if DEBUG
            if case .failure(let f) = DiagnosisDecisionValidator.validate(r.content, allowed: prompt.allowed) {
                print("FNDEBUG rejected \(f): \(r.content)")
            }
            #endif
            return interpretation(DiagnosisDecisionValidator.validate(r.content, allowed: prompt.allowed),
                                  source: r.source, model: r.modelVersion, latency: r.latencyMs)
        } catch {
            #if DEBUG
            print("FNDEBUG structured diagnosis failed: \(error)")
            #endif
            let r = try await ai.respondText(prompt.user, instructions: prompt.system, route: route, cloudModel: cloudModel)
            #if DEBUG
            print("FNDEBUG text fallback: \(r.content.prefix(300))")
            #endif
            return interpretation(DiagnosisDecisionValidator.parse(text: r.content, allowed: prompt.allowed),
                                  source: r.source, model: r.modelVersion, latency: r.latencyMs)
        }
    }

    /// Apple's on-device guardrail sometimes trips on ordinary trade words: "termination looks right"
    /// failed on 3 of 4 iPhone runs, and passed on the fourth. So a guardrail error gets one more
    /// on-device try (about 0.6 s, works offline); on prefer_on_device the cloud takes a last look
    /// when online. If it still fails, the caller's text fallback runs, then the tech taps the answer.
    static func retryingGuardrail<T>(route: InferenceRoute,
                                     _ attempt: (InferenceRoute) async throws -> T) async throws -> T {
        do {
            return try await attempt(route)
        } catch where route != .onlyInCloud && isGuardrail(error) {
            do {
                return try await attempt(route)
            } catch where route == .preferOnDevice && isGuardrail(error) {
                return try await attempt(.onlyInCloud)
            }
        }
    }

    /// FoundationModels' guardrail violation (surfaced through Firebase AI Logic).
    static func isGuardrail(_ error: Error) -> Bool {
        let text = String(describing: error)
        return text.contains("guardrail") || text.contains("unsafe content")
    }

    private func interpretation(_ result: Result<ValidatedDecision, DiagnosisDecisionValidator.Failure>,
                                source: InferenceSource, model: String, latency: Int) -> Interpretation {
        let decision = (try? result.get())
            ?? ValidatedDecision(choice: DiagnosisDecisionValidator.unclear, confidence: 0,
                                 say: "I couldn't match that to one of the options. Pick the one that fits.")
        return Interpretation(decision: decision, source: source, modelVersion: model, latencyMs: latency)
    }
}

/// When nameplate OCR is ambiguous, the on-device model reads the lines; code then checks its answer
/// against the packs' model patterns (the model never invents a pack match).
nonisolated struct NameplateDisambiguator {
    let ai: AIService
    let route: InferenceRoute
    let cloudModel: String

    func resolve(lines: [String]) async throws -> (brand: String?, model: String?, serial: String?, result: AIResult<String>) {
        let template = try PromptTemplate.load(named: "nameplate")
        // The serial number never goes to a model (on-device or cloud): code reads it from the OCR.
        let safeLines = NameplateExtractor.redactingSerial(Array(lines.prefix(40)))
        let p = try template.render(["ocr_lines": safeLines.joined(separator: "\n")])
        let r = try await ai.respondText(p.user, instructions: p.system, route: route, cloudModel: cloudModel)
        let parsed = NameplateReply.parse(r.content)
        return (parsed.brand, parsed.model, nil, r)
    }
}
