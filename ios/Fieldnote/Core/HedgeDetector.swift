import Foundation

/// Words a technician uses when guessing. A guess must not move the diagnosis forward on its own,
/// whatever confidence the model reports, so this check is code, not prompt: the app highlights
/// the model's pick and the tech confirms it with a tap.
nonisolated enum HedgeDetector {
    static let phrases = [
        "not sure", "unsure", "maybe", "might", "i think", "probably", "possibly", "not certain",
        "can't tell", "cant tell", "hard to tell", "i guess", "guessing",
        "haven't checked", "havent checked", "haven't looked", "havent looked", "not checked",
    ]

    static func isHedged(_ note: String) -> Bool {
        let keep = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "'"))
        let words = note.lowercased()
            .replacingOccurrences(of: "\u{2019}", with: "'")
            .components(separatedBy: keep.inverted)
            .filter { !$0.isEmpty }
        let text = " " + words.joined(separator: " ") + " "
        return phrases.contains { text.contains(" \($0) ") }
    }
}
