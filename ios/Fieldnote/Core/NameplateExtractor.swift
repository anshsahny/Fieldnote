import Foundation

/// Pulls brand / model / serial out of nameplate OCR lines with code (regex against each pack's
/// modelPatterns). The on-device model is only consulted when this is ambiguous.
nonisolated struct NameplateExtractor: Sendable {
    struct Candidate: Equatable, Sendable {
        let model: String
        let packId: String
    }

    struct Result: Equatable, Sendable {
        var brand: String?
        var serial: String?
        var candidates: [Candidate]

        /// Exactly one model number matched exactly one pack.
        var confident: Bool { candidates.count == 1 }
        var model: String? { candidates.count == 1 ? candidates[0].model : nil }
        var packId: String? { Set(candidates.map(\.packId)).count == 1 ? candidates.first?.packId : nil }
    }

    private let packs: [(id: String, brand: String, patterns: [NSRegularExpression])]

    init(packs: [FixPack]) {
        self.packs = packs.map { pack in
            (pack.packId, pack.brand, pack.modelPatterns.compactMap { try? NSRegularExpression(pattern: $0) })
        }
    }

    /// Brand names the nameplate may show (sister brands share packs).
    private static let brandAliases: [String: String] = [
        "GOODMAN": "Goodman", "AMANA": "Goodman", "DAIKIN": "Goodman",
        "CARRIER": "Carrier", "BRYANT": "Carrier", "PAYNE": "Carrier",
        "RHEEM": "Rheem", "RUUD": "Rheem",
    ]

    func extract(lines: [String]) -> Result {
        let upper = lines.map { $0.uppercased() }
        let brand = upper.lazy.compactMap { line in
            Self.brandAliases.first { line.contains($0.key) }?.value
        }.first

        var seen = Set<String>()
        var candidates: [Candidate] = []
        for token in upper.flatMap(Self.tokens) {
            for variant in Self.ocrVariants(token) {
                for pack in packs where pack.patterns.contains(where: { Self.fullMatch($0, variant) }) {
                    let key = "\(variant)|\(pack.id)"
                    if !seen.contains(key) {
                        seen.insert(key)
                        candidates.append(Candidate(model: variant, packId: pack.id))
                    }
                }
            }
        }
        // If a brand is printed, prefer candidates from that brand's packs.
        if let brand, candidates.count > 1 {
            let ids = Set(packs.filter { $0.brand == brand }.map(\.id))
            let filtered = candidates.filter { ids.contains($0.packId) }
            if !filtered.isEmpty { candidates = filtered }
        }
        return Result(brand: brand, serial: Self.serial(in: upper), candidates: candidates)
    }

    // MARK: Helpers

    /// Model-number-like tokens: 6+ chars of letters, digits, and dashes, containing a digit.
    static func tokens(_ line: String) -> [String] {
        line.split(whereSeparator: { !($0.isLetter || $0.isNumber || $0 == "-") })
            .map(String.init)
            .filter { $0.count >= 6 && $0.contains(where: \.isNumber) }
    }

    /// The token plus common OCR confusions (letter O read for zero, etc.).
    static func ocrVariants(_ token: String) -> [String] {
        var out = [token]
        let swapped = String(token.map { c -> Character in
            switch c { case "O": "0"; case "I": "1"; default: c }
        })
        if swapped != token { out.append(swapped) }
        return out
    }

    static func fullMatch(_ regex: NSRegularExpression, _ s: String) -> Bool {
        let range = NSRange(s.startIndex..., in: s)
        return regex.firstMatch(in: s, range: range).map { $0.range == range } ?? false
    }

    /// The lines with the serial number replaced, for any model prompt: brand and model are all a
    /// model needs to pick a pack, and the serial is read by code (privacy by design, P6).
    static func redactingSerial(_ lines: [String]) -> [String] {
        var out = lines
        for (i, line) in lines.enumerated() {
            let upper = line.uppercased()
            guard let label = ["SERIAL", "S/N"].first(where: { upper.contains($0) }),
                  let range = upper.range(of: label) else { continue }
            let afterLabel = String(upper[range.upperBound...])
            let hasValue = !tokens(afterLabel.replacingOccurrences(of: "NO.", with: " ").replacingOccurrences(of: "NUMBER", with: " ")).isEmpty
            out[i] = String(line.prefix(upper.distance(from: upper.startIndex, to: range.upperBound))) + " [withheld]"
            if !hasValue, i + 1 < lines.count { out[i + 1] = "[withheld]" }
        }
        return out
    }

    /// The value after a "SERIAL" label, on the same line or the next.
    static func serial(in lines: [String]) -> String? {
        for (i, line) in lines.enumerated() where line.contains("SERIAL") || line.contains("S/N") {
            let afterLabel = line.components(separatedBy: line.contains("SERIAL") ? "SERIAL" : "S/N").last ?? ""
            let sameLine = tokens(afterLabel.replacingOccurrences(of: "NO.", with: " ").replacingOccurrences(of: "NUMBER", with: " "))
            if let hit = sameLine.first { return hit }
            if i + 1 < lines.count, let next = tokens(lines[i + 1]).first { return next }
        }
        return nil
    }
}

/// Parses the on-device nameplate model's reply ("Brand: …\nModel: …\nSerial: …").
nonisolated enum NameplateReply {
    static func parse(_ text: String) -> (brand: String?, model: String?, serial: String?) {
        func field(_ name: String) -> String? {
            guard let match = text.firstMatch(of: try! Regex("(?im)^\\s*\(name)\\s*:\\s*(.+)$")),
                  let value = match.output[1].substring.map(String.init)?.trimmingCharacters(in: .whitespaces),
                  !value.isEmpty, value.lowercased() != "unknown"
            else { return nil }
            return value
        }
        return (field("Brand"), field("Model"), field("Serial"))
    }
}
