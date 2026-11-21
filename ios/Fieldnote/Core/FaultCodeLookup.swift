import Foundation

/// Deterministic fault-code lookup: facts come from the pack, never from the model.
nonisolated enum FaultCodeLookup {
    enum Result: Equatable, Sendable {
        case exact(FixPack.FaultCode)
        /// No exact match; these codes are one keystroke or one display-glyph confusion away.
        case suggestions([FixPack.FaultCode])
        case none
    }

    /// Uppercased, spaces/dashes/dots removed: "ee 2" → "EE2", "3-1" → "31".
    static func normalize(_ input: String) -> String {
        input.uppercased().filter { $0.isLetter || $0.isNumber }
    }

    /// Seven-segment displays make some glyphs look alike (b/6, O/0, S/5, I/1).
    private static let lookalikes: [Character: Character] = ["6": "B", "B": "6", "0": "O", "O": "0", "5": "S", "S": "5", "1": "I", "I": "1"]

    static func lookup(_ input: String, in pack: FixPack) -> Result {
        let key = normalize(input)
        guard !key.isEmpty else { return .none }
        if let hit = pack.faultCodes.first(where: { normalize($0.code) == key }) { return .exact(hit) }

        let close = pack.faultCodes.filter { fc in
            let code = normalize(fc.code)
            return glyphVariants(of: key).contains(code) || editDistance(code, key) == 1
        }
        return close.isEmpty ? .none : .suggestions(close)
    }

    private static func glyphVariants(of key: String) -> Set<String> {
        var out: Set<String> = []
        let chars = Array(key)
        for (i, c) in chars.enumerated() {
            guard let swap = lookalikes[c] else { continue }
            var copy = chars
            copy[i] = swap
            out.insert(String(copy))
        }
        return out
    }

    static func editDistance(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }
        var prev = Array(0...b.count)
        for i in 1...a.count {
            var cur = [i] + Array(repeating: 0, count: b.count)
            for j in 1...b.count {
                cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1))
            }
            prev = cur
        }
        return prev[b.count]
    }
}
