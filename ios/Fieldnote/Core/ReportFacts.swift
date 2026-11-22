import Foundation

/// What a customer report is written from: equipment, fault, the tech's checks and the fix pack's
/// outcome. Privacy by design: no customer name, address, phone, serial number, or the tech's free
/// text notes (they can mention anything). The app prints the customer header itself; the model
/// never sees it. Stored on the report so a later cloud upgrade uses exactly the same facts.
nonisolated struct ReportFacts: Codable, Equatable, Sendable {
    struct Check: Codable, Equatable, Sendable {
        var check: String
        var result: String
    }

    var equipment: String
    var brand: String
    var faultCode: String
    var fault: String
    var checks: [Check]
    /// fix | escalate | resolved
    var outcomeKind: String
    var outcomeTitle: String
    var outcome: String
    var parts: [String]
    var safety: [String]
    /// For fix outcomes: did the tech complete the repair on this visit? nil for other outcomes
    /// (and for reports written before this field existed).
    var repairDone: Bool?

    /// The value the prompt sees.
    var repairDoneText: String {
        switch repairDone {
        case true?: "yes"
        case false?: "no"
        case nil: "not applicable"
        }
    }
}

extension ReportFacts {
    /// Facts from a concluded (or in-progress) diagnosis. `safetyTitles` maps stop ids to plain words.
    static func from(engine e: DiagnosisEngine, equipmentModel: String, repairDone: Bool = false,
                     safetyTitles: (String) -> String = { $0 }) -> ReportFacts {
        let checks = e.history.map { entry -> Check in
            var result = entry.answer
            if case .reading(let value) = entry.via { result += " (measured \(value))" }
            return Check(check: entry.instruction, result: result)
        }
        let model = equipmentModel.trimmingCharacters(in: .whitespaces)
        let outcome = e.outcome
        return ReportFacts(
            equipment: "\(e.pack.brand) \(model.isEmpty ? e.pack.family : model) gas furnace",
            brand: e.pack.brand,
            faultCode: e.fault.code,
            fault: e.fault.meaning,
            checks: checks,
            outcomeKind: outcome?.kind.rawValue ?? "escalate",
            outcomeTitle: outcome == nil ? "Diagnosis not finished." : e.step.instruction,
            outcome: outcome?.summary ?? "The technician did not reach a conclusion on this visit.",
            parts: outcome?.parts ?? [],
            safety: e.acknowledgedStops.map { "\(safetyTitles($0)): reported, checked by the technician before continuing" },
            repairDone: outcome?.kind == .fix ? repairDone : nil)
    }
}

/// Renders the shared `report` prompt from facts.
nonisolated enum ReportPrompt {
    struct Built: Sendable, Equatable {
        let system: String
        let user: String
        let maxWords: Int
        /// Input + expected output, in the same rough units as the diagnosis budget.
        let tokenEstimate: Int
    }

    /// On-device drafts stay short (offline, small model); cloud reports get room for detail.
    static let draftWords = 120
    static let fullWords = 220

    static func build(_ f: ReportFacts, maxWords: Int, template: PromptTemplate) throws -> Built {
        let steps = f.checks.prefix(12).enumerated()
            .map { "\($0.offset + 1). \($0.element.check) Result: \($0.element.result)." }
            .joined(separator: "\n")
        let rendered = try template.render([
            "max_words": String(maxWords),
            "equipment": f.equipment,
            "fault": "\(f.faultCode), \(f.fault)",
            "steps": steps.isEmpty ? "none recorded" : steps,
            "outcome_kind": f.outcomeKind,
            "outcome": "\(f.outcomeTitle) \(f.outcome)",
            "parts": f.parts.isEmpty ? "none" : f.parts.joined(separator: ", "),
            "safety": f.safety.isEmpty ? "none" : f.safety.joined(separator: "; "),
            "repair_done": f.repairDoneText,
        ])
        let output = Int(Double(maxWords) * 1.4) + 80
        let tokens = DiagnosisPrompt.estimateTokens(rendered.system) + DiagnosisPrompt.estimateTokens(rendered.user)
            + DiagnosisPrompt.schemaOverheadTokens + output
        return Built(system: rendered.system, user: rendered.user, maxWords: maxWords, tokenEstimate: tokens)
    }
}
