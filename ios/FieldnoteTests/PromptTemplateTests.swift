import Testing
@testable import Fieldnote

struct PromptTemplateTests {
    let sample = """
    ---
    name: demo
    version: 3
    platforms: [ios, web]
    route: route_demo   # trailing comment
    max_tokens: 500
    ---

    ## System

    Be precise.

    ## User

    Step: {{step}}
    Note: {{note}} / again {{ step }}
    """

    @Test func parsesFrontmatterSectionsAndPlaceholders() throws {
        let t = try PromptTemplate.parse(sample)
        #expect(t.meta == .init(name: "demo", version: 3, platforms: ["ios", "web"], route: "route_demo", maxTokens: 500))
        #expect(t.system == "Be precise.")
        #expect(t.variables == ["step", "note"])
    }

    @Test func rendersEveryPlaceholderIncludingRepeats() throws {
        let rendered = try PromptTemplate.parse(sample).render(["step": "S1", "note": "hums"])
        #expect(rendered.user == "Step: S1\nNote: hums / again S1")
    }

    @Test func refusesMissingOrUnknownVariables() throws {
        let t = try PromptTemplate.parse(sample)
        #expect(throws: PromptTemplate.PromptError.missingVariables(["note"])) { try t.render(["step": "S1"]) }
        #expect(throws: PromptTemplate.PromptError.unknownVariables(["extra"])) {
            try t.render(["step": "S1", "note": "x", "extra": "y"])
        }
    }

    @Test func rejectsMalformedPrompts() {
        #expect(throws: PromptTemplate.PromptError.missingFrontmatter) { try PromptTemplate.parse("## System\nx\n## User\ny") }
        #expect(throws: PromptTemplate.PromptError.missingSection("User")) {
            try PromptTemplate.parse("---\nname: x\nversion: 1\n---\n## System\nonly system\n")
        }
        #expect(throws: PromptTemplate.PromptError.missingField("version")) {
            try PromptTemplate.parse("---\nname: x\n---\n## System\na\n## User\nb\n")
        }
    }

    /// The shared prompts are bundled at build time and parse with the same rules as the web app.
    @Test(arguments: ["diagnosis", "nameplate", "triage", "job_summary"])
    func bundledSharedPromptsLoad(name: String) throws {
        let t = try PromptTemplate.load(named: name)
        #expect(t.meta.name == name)
        #expect(t.meta.route == "route_\(name)")
    }

    @Test func diagnosisPromptHasTheExpectedInputs() throws {
        let t = try PromptTemplate.load(named: "diagnosis")
        #expect(t.variables == ["step_instruction", "allowed_choices", "history", "note"])
    }
}
