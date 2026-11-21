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
            let r = try await ai.respond(prompt.user, generating: DiagnosisDecision.self, instructions: prompt.system,
                                         route: route, cloudModel: cloudModel)
            return interpretation(DiagnosisDecisionValidator.validate(r.content, allowed: prompt.allowed),
                                  source: r.source, model: r.modelVersion, latency: r.latencyMs)
        } catch {
            let r = try await ai.respondText(prompt.user, instructions: prompt.system, route: route, cloudModel: cloudModel)
            return interpretation(DiagnosisDecisionValidator.parse(text: r.content, allowed: prompt.allowed),
                                  source: r.source, model: r.modelVersion, latency: r.latencyMs)
        }
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
        let p = try template.render(["ocr_lines": lines.prefix(40).joined(separator: "\n")])
        let r = try await ai.respondText(p.user, instructions: p.system, route: route, cloudModel: cloudModel)
        let parsed = NameplateReply.parse(r.content)
        return (parsed.brand, parsed.model, parsed.serial, r)
    }
}
