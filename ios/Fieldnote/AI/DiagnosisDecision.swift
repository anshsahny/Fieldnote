import Foundation
import FoundationModels

/// Structured output for one diagnosis step (guided generation on-device, JSON schema in cloud).
/// The model only *proposes* a choice; `DiagnosisDecisionValidator` decides if it is usable.
@Generable
nonisolated struct DiagnosisDecision {
    @Guide(description: "Exactly one of the allowed choices listed in the prompt, or \"unclear\".")
    var choice: String
    @Guide(description: "Confidence from 0 to 1.", .range(0...1))
    var confidence: Double
    @Guide(description: "At most two short sentences for the technician.")
    var say: String
}

nonisolated struct ValidatedDecision: Equatable, Sendable {
    let choice: String
    let confidence: Double
    let say: String
}

/// Same contract as web/src/ai/diagnosis.ts. Used for both the structured path and the
/// JSON-in-text fallback.
nonisolated enum DiagnosisDecisionValidator {
    static let unclear = "unclear"

    enum Failure: Error, Equatable {
        case noJSON
        case malformedJSON
        case notAllowed(String)
        case badConfidence
        case emptySay
    }

    static func validate(choice: String, confidence: Double, say: String,
                         allowed: [String]) -> Result<ValidatedDecision, Failure> {
        let normalized = choice.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let match = (allowed + [unclear]).first(where: { $0.caseInsensitiveCompare(normalized) == .orderedSame })
                ?? shorthandMatch(normalized, in: allowed)
        else { return .failure(.notAllowed(normalized)) }
        guard confidence.isFinite, (0...1).contains(confidence) else { return .failure(.badConfidence) }
        let text = say.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return .failure(.emptySay) }
        return .success(ValidatedDecision(choice: match, confidence: confidence, say: String(text.prefix(400))))
    }

    /// Small models sometimes shorten an option ("loose" for "loose or defective"). Accept the
    /// shortened answer only when every one of its words is in exactly one allowed option. "no" and
    /// "not" are ordinary words here, so a negated answer must match a negated option.
    /// Same rule as web/src/ai/diagnosis.ts `shorthandMatch`.
    static func shorthandMatch(_ choice: String, in allowed: [String]) -> String? {
        let words = matchWords(choice)
        guard !words.isEmpty else { return nil }
        let hits = allowed.filter { words.isSubset(of: matchWords($0)) }
        return hits.count == 1 ? hits[0] : nil
    }

    private static let fillerWords: Set<String> = ["or", "and", "the", "a", "an", "is", "are"]

    static func matchWords(_ s: String) -> Set<String> {
        Set(s.lowercased()
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .map(String.init)
            .filter { !fillerWords.contains($0) })
    }

    static func validate(_ d: DiagnosisDecision, allowed: [String]) -> Result<ValidatedDecision, Failure> {
        validate(choice: d.choice, confidence: d.confidence, say: d.say, allowed: allowed)
    }

    /// Fallback path: the model answered in plain text; pull out and validate the JSON object.
    static func parse(text: String, allowed: [String]) -> Result<ValidatedDecision, Failure> {
        guard let json = extractJSONObject(text), let data = json.data(using: .utf8) else { return .failure(.noJSON) }
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .failure(.malformedJSON)
        }
        guard let choice = obj["choice"] as? String else { return .failure(.notAllowed("")) }
        let confidence: Double? = switch obj["confidence"] {
        case let n as NSNumber: n.doubleValue
        case let s as String: Double(s)
        default: nil
        }
        guard let confidence else { return .failure(.badConfidence) }
        return validate(choice: choice, confidence: confidence, say: obj["say"] as? String ?? "", allowed: allowed)
    }

    /// First balanced {...} in the text; tolerates ```json fences and chatter.
    static func extractJSONObject(_ text: String) -> String? {
        let s = Array(text.replacingOccurrences(of: "```json", with: "").replacingOccurrences(of: "```", with: ""))
        guard let start = s.firstIndex(of: "{") else { return nil }
        var depth = 0
        var inString = false
        var i = start
        while i < s.count {
            let c = s[i]
            if inString {
                if c == "\\" { i += 1 } else if c == "\"" { inString = false }
            } else if c == "\"" {
                inString = true
            } else if c == "{" {
                depth += 1
            } else if c == "}" {
                depth -= 1
                if depth == 0 { return String(s[start...i]) }
            }
            i += 1
        }
        return nil
    }
}
