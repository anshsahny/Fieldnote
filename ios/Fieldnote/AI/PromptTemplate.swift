import Foundation

/// Parser/renderer for shared/prompts/*.md (same rules as web/src/ai/prompts.ts).
/// The prompt files are copied into the app bundle under `prompts/` at build time.
nonisolated struct PromptTemplate: Sendable, Equatable {
    struct Meta: Sendable, Equatable {
        var name: String
        var version: Int
        var platforms: [String]
        var route: String?
        var maxTokens: Int?
    }

    enum PromptError: Error, Equatable, LocalizedError {
        case notFound(String)
        case missingFrontmatter
        case missingField(String)
        case missingSection(String)
        case missingVariables([String])
        case unknownVariables([String])

        var errorDescription: String? {
            switch self {
            case .notFound(let n): "Prompt \(n).md is not in the app bundle"
            case .missingFrontmatter: "Prompt is missing its --- frontmatter --- header"
            case .missingField(let f): "Prompt frontmatter needs \"\(f)\""
            case .missingSection(let s): "Prompt needs a \"## \(s)\" section"
            case .missingVariables(let v): "Prompt is missing: \(v.joined(separator: ", "))"
            case .unknownVariables(let v): "Prompt has no placeholder for: \(v.joined(separator: ", "))"
            }
        }
    }

    let meta: Meta
    let system: String
    let user: String
    /// Placeholder names used in the user section, in first-seen order.
    let variables: [String]

    static func load(named name: String, bundle: Bundle = .main) throws -> PromptTemplate {
        guard let url = bundle.url(forResource: name, withExtension: "md", subdirectory: "prompts"),
              let text = try? String(contentsOf: url, encoding: .utf8)
        else { throw PromptError.notFound(name) }
        return try parse(text)
    }

    static func parse(_ source: String) throws -> PromptTemplate {
        let text = source.replacingOccurrences(of: "\r\n", with: "\n")
        guard text.hasPrefix("---\n"),
              let end = text.range(of: "\n---\n", range: text.index(text.startIndex, offsetBy: 4)..<text.endIndex)
        else { throw PromptError.missingFrontmatter }

        var fields: [String: String] = [:]
        for line in text[text.index(text.startIndex, offsetBy: 4)..<end.lowerBound].split(separator: "\n") {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[..<colon].trimmingCharacters(in: .whitespaces)
            var value = String(line[line.index(after: colon)...])
            if let hash = value.range(of: " #") { value = String(value[..<hash.lowerBound]) }
            fields[key] = value.trimmingCharacters(in: .whitespaces)
        }
        guard let name = fields["name"], !name.isEmpty else { throw PromptError.missingField("name") }
        guard let version = fields["version"].flatMap(Int.init) else { throw PromptError.missingField("version") }
        let platforms = (fields["platforms"] ?? "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        var sections: [String: [Substring]] = [:]
        var current: String?
        for line in text[end.upperBound...].split(separator: "\n", omittingEmptySubsequences: false) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed == "## System" || trimmed == "## User" {
                current = String(trimmed.dropFirst(3))
                sections[current!] = []
            } else if let current {
                sections[current]!.append(line)
            }
        }
        func body(_ key: String) throws -> String {
            let joined = (sections[key] ?? []).joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !joined.isEmpty else { throw PromptError.missingSection(key) }
            return joined
        }
        let system = try body("System")
        let user = try body("User")

        var variables: [String] = []
        for match in user.matches(of: Self.placeholder) {
            let name = String(match.output.1)
            if !variables.contains(name) { variables.append(name) }
        }
        return PromptTemplate(
            meta: Meta(name: name, version: version, platforms: platforms,
                       route: fields["route"], maxTokens: fields["max_tokens"].flatMap(Int.init)),
            system: system, user: user, variables: variables)
    }

    func render(_ vars: [String: String]) throws -> (system: String, user: String) {
        let missing = variables.filter { vars[$0] == nil }
        guard missing.isEmpty else { throw PromptError.missingVariables(missing) }
        let unknown = vars.keys.filter { !variables.contains($0) }.sorted()
        guard unknown.isEmpty else { throw PromptError.unknownVariables(unknown) }
        let rendered = user.replacing(Self.placeholder) { match in vars[String(match.output.1)]! }
        return (system, rendered)
    }

    private static var placeholder: Regex<(Substring, Substring)> {
        /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/
    }
}
