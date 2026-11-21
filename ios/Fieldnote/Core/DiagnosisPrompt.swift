import Foundation

/// Builds the on-device prompt from shared/prompts/diagnosis.md with only the current step, its
/// allowed answers, and the last three history items (never the whole pack).
nonisolated enum DiagnosisPrompt {
    struct Built: Sendable, Equatable {
        let system: String
        let user: String
        let allowed: [String]
        let tokenEstimate: Int
    }

    struct HistoryLine: Sendable, Equatable {
        let instruction: String
        let answer: String
    }

    /// Guided-generation schema + framing the SDK adds around our text.
    static let schemaOverheadTokens = 200

    /// Conservative estimate (~3.5 characters per token for English).
    static func estimateTokens(_ text: String) -> Int {
        Int((Double(text.count) / 3.5).rounded(.up))
    }

    static func build(step: FixPack.Step, history: [HistoryLine], note: String, template: PromptTemplate) throws -> Built {
        let allowed = step.ask?.options ?? []
        let recent = history.suffix(3)
        let historyText = recent.isEmpty
            ? "none"
            : recent.map { "\($0.instruction) → \($0.answer)" }.joined(separator: "; ")
        let unit = step.ask?.unit.map { " (unit: \($0))" } ?? ""
        let rendered = try template.render([
            "step_instruction": step.instruction + unit,
            "allowed_choices": allowed.joined(separator: " | "),
            "history": historyText,
            "note": String(note.prefix(500)),
        ])
        let tokens = estimateTokens(rendered.system) + estimateTokens(rendered.user) + schemaOverheadTokens
        return Built(system: rendered.system, user: rendered.user, allowed: allowed, tokenEstimate: tokens)
    }
}
