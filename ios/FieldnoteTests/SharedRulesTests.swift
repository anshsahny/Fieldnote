import Foundation
import Testing
@testable import Fieldnote

private final class RulesBundleToken {}

/// The same cases as web/src/diagnosis/rules.test.ts (shared/fixtures/diagnosis/rules.json),
/// so the iPhone and the web runner apply identical safety, hedge and clarification rules.
struct SharedRulesTests {
    struct Cases: Decodable {
        struct Safety: Decodable { let text: String; let stop: String? }
        struct Hedge: Decodable { let text: String; let hedged: Bool }
        struct Clarify: Decodable { let choice: String; let confidence: Double; let note: String; let expect: String }
        let safety: [Safety]
        let hedge: [Hedge]
        let clarify: [Clarify]
        let threshold: Double
    }

    static let cases: Cases = {
        let url = Bundle(for: RulesBundleToken.self).resourceURL!.appendingPathComponent("fixtures/diagnosis/rules.json")
        return try! JSONDecoder().decode(Cases.self, from: Data(contentsOf: url))
    }()

    @Test func safetyGuardMatchesTheSharedCases() {
        let guardian = SafetyGuard(packStops: [])
        for c in Self.cases.safety {
            #expect(guardian.check(c.text)?.id == c.stop, "\(c.text)")
        }
    }

    @Test func hedgeDetectorMatchesTheSharedCases() {
        for c in Self.cases.hedge {
            #expect(HedgeDetector.isHedged(c.text) == c.hedged, "\(c.text)")
        }
    }

    @Test func clarificationRuleMatchesTheSharedCases() {
        for c in Self.cases.clarify {
            let d = ValidatedDecision(choice: c.choice, confidence: c.confidence, say: "x")
            let result = DiagnosisEngine.clarification(for: d, note: c.note, threshold: Self.cases.threshold)
            let kind: String = switch result {
            case nil: "advance"
            case .unclear?: "unclear"
            case .lowConfidence?: "lowConfidence"
            case .hedged?: "hedged"
            case .aiUnavailable?: "aiUnavailable"
            }
            #expect(kind == c.expect, "\(c.choice) \(c.confidence) \(c.note)")
        }
    }
}
