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
