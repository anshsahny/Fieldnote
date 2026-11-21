import Testing
@testable import Fieldnote

struct DiagnosisDecisionValidatorTests {
    let allowed = ["runs", "does not run", "runs noisy"]

    @Test func goodPayloadIsAcceptedAndCasingNormalized() {
        let r = DiagnosisDecisionValidator.parse(
            text: #"{"choice":"Does Not Run","confidence":0.82,"say":"Inducer is silent."}"#, allowed: allowed)
        #expect(r == .success(ValidatedDecision(choice: "does not run", confidence: 0.82, say: "Inducer is silent.")))
    }

    @Test func fencedJSONWithChatterIsAccepted() throws {
        let text = "Sure!\n```json\n{\"choice\":\"unclear\",\"confidence\":\"0.3\",\"say\":\"Need more info.\"}\n```"
        let decision = try DiagnosisDecisionValidator.parse(text: text, allowed: allowed).get()
        #expect(decision.choice == "unclear")
        #expect(decision.confidence == 0.3)
    }

    @Test func malformedJSONIsRejected() {
        let r = DiagnosisDecisionValidator.parse(text: #"{"choice": "runs", "confidence": 0.9, "say": }"#, allowed: allowed)
        #expect(r == .failure(.malformedJSON))
    }

    @Test func textWithoutJSONIsRejected() {
        #expect(DiagnosisDecisionValidator.parse(text: "The inducer runs.", allowed: allowed) == .failure(.noJSON))
    }

    @Test func outOfEnumChoiceIsRejected() {
        let r = DiagnosisDecisionValidator.parse(
            text: #"{"choice":"replace the board","confidence":0.9,"say":"x"}"#, allowed: allowed)
        #expect(r == .failure(.notAllowed("replace the board")))
    }

    // Shorthand answers (seen on-device: "loose" for "loose or defective"). Same table as web.
    @Test(arguments: [
        ("loose", ["loose or defective", "blower ok"], "loose or defective"),
        ("Coated", ["clean and shiny", "coated or oxidized"], "coated or oxidized"),
        ("ok", ["restricted or undersized", "vent ok"], "vent ok"),
        ("no short", ["short found", "no short found"], "no short found"),
    ])
    func uniqueShorthandIsAccepted(choice: String, options: [String], expected: String) throws {
        let d = try DiagnosisDecisionValidator.validate(choice: choice, confidence: 0.8, say: "x", allowed: options).get()
        #expect(d.choice == expected)
    }

    @Test(arguments: [
        ("short", ["short found", "no short found"]),            // fits both options
        ("pressure", ["pressure correct", "pressure incorrect"]), // fits both options
        ("not blocked", ["blocked", "clear"]),                    // negation must be in the option
        ("or", ["dirty or loose", "clean and secure"]),           // filler only
    ])
    func ambiguousOrNegatedShorthandIsRejected(choice: String, options: [String]) {
        let r = DiagnosisDecisionValidator.validate(choice: choice, confidence: 0.8, say: "x", allowed: options)
        #expect(r == .failure(.notAllowed(choice)))
    }

    @Test(arguments: [7.0, -0.1, Double.nan])
    func confidenceOutsideZeroToOneIsRejected(confidence: Double) {
        let r = DiagnosisDecisionValidator.validate(choice: "runs", confidence: confidence, say: "x", allowed: allowed)
        #expect(r == .failure(.badConfidence))
    }

    @Test func emptySayIsRejected() {
        let r = DiagnosisDecisionValidator.validate(choice: "runs", confidence: 0.5, say: "   ", allowed: allowed)
        #expect(r == .failure(.emptySay))
    }

    @Test func extractHandlesBracesInsideStrings() {
        #expect(DiagnosisDecisionValidator.extractJSONObject(#"x {"say":"a } b","n":{"k":1}} y"#) == #"{"say":"a } b","n":{"k":1}}"#)
    }
}
