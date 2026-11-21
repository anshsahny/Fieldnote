import Foundation

/// Parses a reading step's option labels ("below 0.5 uA", "0.5 uA or more", "3.2 to 3.8 in. w.c.")
/// into numeric ranges, so the branch for a measured value is chosen by code, not by the model.
nonisolated struct ReadingRange: Equatable, Sendable {
    var min: Double?
    var max: Double?
    var minInclusive = true
    var maxInclusive = false

    func contains(_ value: Double) -> Bool {
        if let min, minInclusive ? value < min : value <= min { return false }
        if let max, maxInclusive ? value > max : value >= max { return false }
        return true
    }

    static func parse(_ option: String) -> ReadingRange? {
        let text = option.lowercased()
        // Unsigned on purpose: in "3.2-3.8" the dash is a range, not a minus sign.
        let numbers = text.matches(of: /\d+(?:\.\d+)?/).compactMap { Double($0.output) }
        guard let first = numbers.first else { return nil }
        if numbers.count >= 2, text.contains(" to ") || text.contains("between") || text.contains("-") {
            return ReadingRange(min: first, max: numbers[1], minInclusive: true, maxInclusive: true)
        }
        if text.contains("below") || text.contains("under") || text.contains("less than") || text.contains("<") {
            return ReadingRange(min: nil, max: first, maxInclusive: false)
        }
        if text.contains("or more") || text.contains("above") || text.contains("over") || text.contains("at least")
            || text.contains(">") || text.contains("+") {
            let inclusive = text.contains("or more") || text.contains("at least") || text.contains(">=")
            return ReadingRange(min: first, max: nil, minInclusive: inclusive)
        }
        return nil
    }

    /// Ranges for every option, or nil if any option can't be parsed (then the tech taps instead).
    static func ranges(for options: [String]) -> [(option: String, range: ReadingRange)]? {
        var out: [(String, ReadingRange)] = []
        for option in options {
            guard let r = parse(option) else { return nil }
            out.append((option, r))
        }
        return out
    }

    /// The single option whose range contains the value; nil if none or ambiguous.
    static func option(for value: Double, options: [String]) -> String? {
        guard let ranges = ranges(for: options) else { return nil }
        let hits = ranges.filter { $0.range.contains(value) }
        return hits.count == 1 ? hits[0].option : nil
    }
}
