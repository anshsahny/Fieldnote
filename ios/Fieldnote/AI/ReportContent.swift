import Foundation
import FoundationModels

/// Structured output for a customer report (guided generation on-device, JSON schema in cloud).
/// Counts and lengths are enforced in code by `ReportContentValidator`, not by the model.
@Generable
nonisolated struct ServiceReportDraft {
    @Guide(description: "Two or three sentences for the homeowner: what was wrong and what was done or is needed next.")
    var summary: String
    @Guide(description: "The checks the technician did, in order, one short item each.")
    var workPerformed: [String]
    @Guide(description: "What the technician found, one short item each.")
    var findings: [String]
    @Guide(description: "Next steps for the homeowner; empty if none.")
    var recommendations: [String]
    @Guide(description: "Safety notes, only if safety stops were listed; otherwise empty.")
    var safetyNotes: [String]
}

/// A validated report body, as stored in Firestore.
nonisolated struct ReportContent: Codable, Equatable, Sendable {
    var summary: String
    var workPerformed: [String]
    var findings: [String]
    var recommendations: [String]
    var safetyNotes: [String]
}

extension ReportContent {
    /// Plain text for the share sheet (Messages, Mail, AirDrop): the app's own header, then the body.
    func shareText(customer: String, address: String, equipment: String, code: String, date: String,
                   parts: [String], credit: String) -> String {
        func block(_ title: String, _ items: [String]) -> String? {
            items.isEmpty ? nil : ([title.uppercased()] + items.map { "• " + $0.sentenceCased }).joined(separator: "\n")
        }
        let header = ["Service report · \(date)", customer, address, "\(equipment) · fault code \(code)"].joined(separator: "\n")
        return ([header, summary,
                 block("Work performed", workPerformed), block("Findings", findings),
                 block("Recommendations", recommendations), block("Parts", parts), block("Safety", safetyNotes),
                 credit] as [String?]).compactMap { $0 }.joined(separator: "\n\n")
    }
}

nonisolated enum ReportContentValidator {
    enum Failure: Error, Equatable { case emptySummary, noJSON, malformedJSON }

    static let maxItems = 8
    static let maxItemChars = 240
    static let maxSummaryChars = 700

    static func validate(summary: String, workPerformed: [String], findings: [String],
                         recommendations: [String], safetyNotes: [String]) -> Result<ReportContent, Failure> {
        func clean(_ s: String, _ limit: Int) -> String {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.count <= limit ? t : String(t.prefix(limit - 1)) + "…"
        }
        func list(_ items: [String]) -> [String] {
            Array(items.map { clean($0, maxItemChars) }.filter { !$0.isEmpty }.prefix(maxItems))
        }
        let s = clean(summary, maxSummaryChars)
        guard !s.isEmpty else { return .failure(.emptySummary) }
        return .success(ReportContent(summary: s, workPerformed: list(workPerformed), findings: list(findings),
                                      recommendations: list(recommendations), safetyNotes: list(safetyNotes)))
    }

    static func validate(_ d: ServiceReportDraft) -> Result<ReportContent, Failure> {
        validate(summary: d.summary, workPerformed: d.workPerformed, findings: d.findings,
                 recommendations: d.recommendations, safetyNotes: d.safetyNotes)
    }

    /// Fallback path: the model answered in plain text; pull out and validate the JSON object.
    static func parse(text: String) -> Result<ReportContent, Failure> {
        guard let json = DiagnosisDecisionValidator.extractJSONObject(text), let data = json.data(using: .utf8) else {
            return .failure(.noJSON)
        }
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return .failure(.malformedJSON) }
        func strings(_ key: String) -> [String] { (obj[key] as? [Any])?.compactMap { $0 as? String } ?? [] }
        return validate(summary: obj["summary"] as? String ?? "", workPerformed: strings("workPerformed"),
                        findings: strings("findings"), recommendations: strings("recommendations"),
                        safetyNotes: strings("safetyNotes"))
    }

    /// No model at all: a plain report assembled from the facts, so the tech always has something
    /// to leave with the customer.
    static func plain(from f: ReportFacts) -> ReportContent {
        let repaired = f.outcomeKind == "fix" && f.repairDone == true
        let next: String = switch f.outcomeKind {
        case "fix": repaired ? "No further action needed unless the fault returns." : "Recommended repair: \(f.outcome)"
        case "resolved": "No further action needed."
        default: "A follow-up visit is needed: \(f.outcome)"
        }
        var work = f.checks.map(\.check)
        if repaired { work.append("Repair completed: \(f.outcome)") }
        return ReportContent(
            summary: "Your \(f.brand) furnace showed fault code \(f.faultCode) (\(f.fault)). Finding: \(f.outcomeTitle).",
            workPerformed: Array(work.prefix(maxItems)),
            findings: Array(f.checks.map { "\($0.check) Result: \($0.result)." }.prefix(maxItems)),
            recommendations: [next],
            safetyNotes: f.safety)
    }
}
