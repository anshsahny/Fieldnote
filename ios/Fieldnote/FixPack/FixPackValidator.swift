import Foundation

/// Same rules, error codes, and paths as web/src/fixpack/validate.ts; both are tested against
/// shared/fixtures/fixpacks/manifest.json.
nonisolated enum FixPackValidator {
    enum Code: String, Sendable, Comparable {
        case json = "E_JSON", packSize = "E_PACK_SIZE", schema = "E_SCHEMA", stringLength = "E_STRING_LENGTH"
        case duplicateCode = "E_DUPLICATE_CODE", sourceRef = "E_SOURCE_REF", modelPattern = "E_MODEL_PATTERN"
        case firstStep = "E_FIRST_STEP", stepShape = "E_STEP_SHAPE", askNextMismatch = "E_ASK_NEXT_MISMATCH"
        case nextTarget = "E_NEXT_TARGET", orphanStep = "E_ORPHAN_STEP", cycle = "E_CYCLE"
        case safetyMissing = "E_SAFETY_MISSING", safetyRef = "E_SAFETY_REF"

        static func < (a: Code, b: Code) -> Bool { a.rawValue < b.rawValue }
    }

    struct Issue: Sendable, Equatable, CustomStringConvertible {
        let code: Code
        let path: String
        let message: String
        var description: String { "\(code.rawValue) at \(path.isEmpty ? "<root>" : path): \(message)" }
    }

    enum Result: Sendable {
        case valid(FixPack, bytes: Int)
        case invalid([Issue], bytes: Int)

        var issues: [Issue] { if case .invalid(let i, _) = self { i } else { [] } }
        var pack: FixPack? { if case .valid(let p, _) = self { p } else { nil } }
    }

    /// Validates the pack exactly as stored (its JSON bytes), so the size limit matches the web.
    static func validate(json data: Data, requiredSafetyIDs: [String] = UniversalSafetyStops.requiredIDs) -> Result {
        let bytes = data.count
        if bytes > FixPack.maxPackBytes {
            return .invalid([Issue(code: .packSize, path: "", message: "Pack is \(bytes) bytes; the limit is \(FixPack.maxPackBytes).")], bytes: bytes)
        }
        guard (try? JSONSerialization.jsonObject(with: data)) != nil else {
            return .invalid([Issue(code: .json, path: "", message: "Not valid JSON.")], bytes: bytes)
        }
        let pack: FixPack
        do {
            pack = try JSONDecoder().decode(FixPack.self, from: data)
        } catch {
            return .invalid([Issue(code: .schema, path: decodingPath(error), message: "\(error)")], bytes: bytes)
        }
        let schema = schemaIssues(pack)
        if !schema.isEmpty { return .invalid(sorted(schema), bytes: bytes) }
        let issues = ruleIssues(pack, requiredSafetyIDs: requiredSafetyIDs)
        return issues.isEmpty ? .valid(pack, bytes: bytes) : .invalid(sorted(issues), bytes: bytes)
    }

    // MARK: Shape constraints the web expresses in zod

    private static func schemaIssues(_ p: FixPack) -> [Issue] {
        var out: [Issue] = []
        func check(_ ok: Bool, _ path: String, _ message: String) {
            if !ok { out.append(Issue(code: .schema, path: path, message: message)) }
        }
        func nonEmpty(_ s: String, _ path: String) { check(!s.isEmpty, path, "must not be empty") }
        check(p.schemaVersion == 1, "schemaVersion", "must be 1")
        check(p.packId.wholeMatch(of: /[a-z0-9][a-z0-9-]{2,63}/) != nil, "packId", "lowercase, digits, dashes")
        nonEmpty(p.brand, "brand"); nonEmpty(p.family, "family")
        check((1...10).contains(p.modelPatterns.count), "modelPatterns", "1 to 10 patterns")
        check(p.version >= 1, "version", "must be >= 1")
        check((1...5).contains(p.sourceRefs.count), "sourceRefs", "1 to 5 sources")
        for (i, s) in p.sourceRefs.enumerated() {
            check(URL(string: s.url)?.scheme == "https", "sourceRefs.\(i).url", "must be an https URL")
            nonEmpty(s.id, "sourceRefs.\(i).id"); nonEmpty(s.title, "sourceRefs.\(i).title"); nonEmpty(s.pages, "sourceRefs.\(i).pages")
        }
        check((1...40).contains(p.faultCodes.count), "faultCodes", "1 to 40 fault codes")
        for (i, fc) in p.faultCodes.enumerated() {
            nonEmpty(fc.code, "faultCodes.\(i).code"); nonEmpty(fc.meaning, "faultCodes.\(i).meaning")
            check((1...8).contains(fc.likelyCauses.count), "faultCodes.\(i).likelyCauses", "1 to 8 causes")
        }
        for (id, step) in p.steps {
            check(id.wholeMatch(of: /[A-Za-z0-9_-]{1,32}/) != nil, "steps.\(id)", "step id: 1-32 of A-Z a-z 0-9 _ -")
            nonEmpty(step.instruction, "steps.\(id).instruction")
            if let ask = step.ask { check((2...6).contains(ask.options.count), "steps.\(id).ask.options", "2 to 6 options") }
            if let safety = step.safety { check(isSafetyID(safety), "steps.\(id).safety", "safety id: UPPER_SNAKE") }
        }
        check((1...20).contains(p.safetyStops.count), "safetyStops", "1 to 20 safety stops")
        for (i, s) in p.safetyStops.enumerated() {
            check(isSafetyID(s.id), "safetyStops.\(i).id", "safety id: UPPER_SNAKE")
            check(!s.triggers.isEmpty, "safetyStops.\(i).triggers", "at least one trigger")
        }
        return out
    }

    private static func isSafetyID(_ s: String) -> Bool { s.wholeMatch(of: /[A-Z][A-Z0-9_]{1,31}/) != nil }

    // MARK: Cross-reference rules

    private static func ruleIssues(_ p: FixPack, requiredSafetyIDs: [String]) -> [Issue] {
        var out: [Issue] = []
        func add(_ code: Code, _ path: String, _ message: String) { out.append(Issue(code: code, path: path, message: message)) }

        // Strings ≤ 200 Unicode scalars (URLs excepted).
        for (path, s) in allStrings(p) where s.unicodeScalars.count > FixPack.maxString {
            add(.stringLength, path, "\(s.unicodeScalars.count) characters; the limit is \(FixPack.maxString).")
        }

        let sourceIDs = Set(p.sourceRefs.map(\.id))
        var seen = Set<String>()
        for (i, fc) in p.faultCodes.enumerated() {
            let key = fc.code.trimmingCharacters(in: .whitespaces).lowercased()
            if seen.contains(key) { add(.duplicateCode, "faultCodes[\(i)].code", "Fault code \"\(fc.code)\" appears more than once.") }
            seen.insert(key)
            if !sourceIDs.contains(fc.sourceRef) { add(.sourceRef, "faultCodes[\(i)].sourceRef", "Unknown source \"\(fc.sourceRef)\".") }
            if p.steps[fc.firstStep] == nil { add(.firstStep, "faultCodes[\(i)].firstStep", "Step \"\(fc.firstStep)\" does not exist.") }
        }

        for (i, pattern) in p.modelPatterns.enumerated() {
            let anchored = pattern.hasPrefix("^") && pattern.hasSuffix("$")
            if !anchored || (try? NSRegularExpression(pattern: pattern)) == nil {
                add(.modelPattern, "modelPatterns[\(i)]", "\"\(pattern)\" must be a valid regex anchored with ^ and $.")
            }
        }

        let safetyIDs = Set(p.safetyStops.map(\.id))
        for (id, step) in p.steps {
            let base = "steps.\(id)"
            let isDecision = step.ask != nil && step.next != nil && step.outcome == nil
            let isLeaf = step.outcome != nil && step.ask == nil && step.next == nil
            if !isDecision && !isLeaf {
                add(.stepShape, base, "A step needs either ask + next (decision) or outcome (leaf), not both or neither.")
            }
            if let ask = step.ask, let next = step.next, ask.options.sorted() != next.keys.sorted() {
                add(.askNextMismatch, "\(base).next", "Options must match next keys.")
            }
            for (option, target) in step.next ?? [:] where p.steps[target] == nil {
                add(.nextTarget, "\(base).next.\(option)", "Step \"\(target)\" does not exist.")
            }
            if let safety = step.safety, !safetyIDs.contains(safety) {
                add(.safetyRef, "\(base).safety", "Unknown safety stop \"\(safety)\".")
            }
        }

        // Reachability and cycles from every fault code's first step.
        var reachable = Set<String>()
        var state: [String: Bool] = [:] // false = visiting, true = done
        var cycles = Set<String>()
        func visit(_ id: String) {
            guard let step = p.steps[id] else { return }
            reachable.insert(id)
            if let s = state[id] {
                if !s { cycles.insert(id) }
                return
            }
            state[id] = false
            for target in (step.next ?? [:]).keys.sorted().compactMap({ step.next?[$0] }) { visit(target) }
            state[id] = true
        }
        for fc in p.faultCodes { visit(fc.firstStep) }
        for id in cycles { add(.cycle, "steps.\(id)", "Step \"\(id)\" is part of a loop; every path must end in an outcome.") }
        for id in p.steps.keys where !reachable.contains(id) {
            add(.orphanStep, "steps.\(id)", "Step \"\(id)\" is not reachable from any fault code.")
        }

        for id in requiredSafetyIDs where !safetyIDs.contains(id) {
            add(.safetyMissing, "safetyStops", "Universal safety stop \"\(id)\" is missing.")
        }
        return out
    }

    private static func allStrings(_ p: FixPack) -> [(String, String)] {
        var out: [(String, String)] = [("packId", p.packId), ("brand", p.brand), ("family", p.family)]
        out += p.modelPatterns.enumerated().map { ("modelPatterns[\($0.offset)]", $0.element) }
        for (i, s) in p.sourceRefs.enumerated() {
            out += [("sourceRefs[\(i)].id", s.id), ("sourceRefs[\(i)].title", s.title), ("sourceRefs[\(i)].pages", s.pages)]
        }
        for (i, fc) in p.faultCodes.enumerated() {
            let b = "faultCodes[\(i)]"
            out += [("\(b).code", fc.code), ("\(b).display", fc.display), ("\(b).meaning", fc.meaning),
                    ("\(b).firstStep", fc.firstStep), ("\(b).sourceRef", fc.sourceRef), ("\(b).pages", fc.pages)]
            out += fc.likelyCauses.enumerated().map { ("\(b).likelyCauses[\($0.offset)]", $0.element) }
        }
        for (id, step) in p.steps {
            let b = "steps.\(id)"
            out.append(("\(b).instruction", step.instruction))
            if let ask = step.ask {
                out += ask.options.enumerated().map { ("\(b).ask.options[\($0.offset)]", $0.element) }
                if let unit = ask.unit { out.append(("\(b).ask.unit", unit)) }
            }
            for (k, v) in step.next ?? [:] { out.append(("\(b).next.\(k)", v)) }
            if let o = step.outcome {
                out.append(("\(b).outcome.summary", o.summary))
                out += (o.parts ?? []).enumerated().map { ("\(b).outcome.parts[\($0.offset)]", $0.element) }
            }
            if let s = step.safety { out.append(("\(b).safety", s)) }
            if let pages = step.pages { out.append(("\(b).pages", pages)) }
        }
        for (i, s) in p.safetyStops.enumerated() {
            out += [("safetyStops[\(i)].id", s.id), ("safetyStops[\(i)].message", s.message)]
            out += s.triggers.enumerated().map { ("safetyStops[\(i)].triggers[\($0.offset)]", $0.element) }
        }
        return out
    }

    private static func decodingPath(_ error: Error) -> String {
        guard let e = error as? DecodingError else { return "" }
        let context: DecodingError.Context? = switch e {
        case .keyNotFound(let key, let c): DecodingError.Context(codingPath: c.codingPath + [key], debugDescription: c.debugDescription)
        case .typeMismatch(_, let c), .valueNotFound(_, let c), .dataCorrupted(let c): c
        @unknown default: nil
        }
        return context?.codingPath.map { $0.intValue.map(String.init) ?? $0.stringValue }.joined(separator: ".") ?? ""
    }

    private static func sorted(_ issues: [Issue]) -> [Issue] {
        issues.sorted { $0.code == $1.code ? $0.path < $1.path : $0.code < $1.code }
    }
}
