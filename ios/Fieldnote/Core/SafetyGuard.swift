import Foundation

/// Deterministic safety check on the technician's free text. Runs before any model call and can
/// never be overridden by a model. Errs on the side of stopping (no negation handling: "no gas
/// smell" still stops, and the tech acknowledges it).
nonisolated struct SafetyGuard: Sendable {
    private struct Rule: Sendable {
        let stop: FixPack.SafetyStop
        let triggers: [[String]]
    }

    private let rules: [Rule]

    /// Merges the pack's stops with the app's bundled universal stops (union of triggers by id),
    /// so newer triggers protect older packs too.
    init(packStops: [FixPack.SafetyStop], universal: [FixPack.SafetyStop] = UniversalSafetyStops.load()) {
        var byID: [String: FixPack.SafetyStop] = [:]
        var order: [String] = []
        for stop in universal + packStops {
            if let existing = byID[stop.id] {
                let triggers = existing.triggers + stop.triggers.filter { !existing.triggers.contains($0) }
                byID[stop.id] = FixPack.SafetyStop(id: stop.id, triggers: triggers, message: existing.message)
            } else {
                byID[stop.id] = stop
                order.append(stop.id)
            }
        }
        rules = order.compactMap { id in
            byID[id].map { Rule(stop: $0, triggers: $0.triggers.map(Self.tokens).filter { !$0.isEmpty }) }
        }
    }

    /// The first stop whose trigger appears in the text, or nil.
    func check(_ text: String) -> FixPack.SafetyStop? {
        let words = Self.tokens(text)
        guard !words.isEmpty else { return nil }
        for rule in rules where rule.triggers.contains(where: { Self.matches($0, in: words) }) {
            return rule.stop
        }
        return nil
    }

    // MARK: Matching

    /// Lowercased words with light stemming ("smells" → "smell", "sparking" → "spark").
    static func tokens(_ text: String) -> [String] {
        text.lowercased()
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .map { stem(String($0)) }
    }

    static func stem(_ w: String) -> String {
        for suffix in ["ing", "ed", "es", "s"] where w.count > suffix.count + 2 && w.hasSuffix(suffix) {
            return String(w.dropLast(suffix.count))
        }
        return w
    }

    /// Trigger words in order, allowing up to two other words between consecutive trigger words.
    static func matches(_ trigger: [String], in words: [String]) -> Bool {
        guard let first = trigger.first else { return false }
        for start in words.indices where words[start] == first {
            var position = start
            var matched = true
            for word in trigger.dropFirst() {
                guard position + 1 < words.count else {
                    matched = false
                    break
                }
                let window = (position + 1)...min(position + 3, words.count - 1)
                guard let hit = window.first(where: { words[$0] == word }) else {
                    matched = false
                    break
                }
                position = hit
            }
            if matched { return true }
        }
        return false
    }
}
