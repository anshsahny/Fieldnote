import Foundation

/// A diagnosis in progress, as saved to orgs/{org}/jobs/{jobId}/sessions/{id} after every step
/// (Firestore queues the write offline and keeps it across an app kill). Field names match the
/// Firestore rule `validSession`.
nonisolated struct SessionState: Codable, Equatable, Sendable, Identifiable {
    enum Status: String, Codable, Sendable { case active, concluded, abandoned }

    struct Step: Codable, Equatable, Sendable {
        var stepId: String
        var instruction: String
        var answer: String
        /// tap | reading | note
        var via: String
        /// The reading as entered, or the tech's note.
        var input: String?
        var source: String?
        var latencyMs: Int?
        var model: String?
        var confidence: Double?
        var say: String?
    }

    var schemaVersion = 1
    var id: String
    var jobId: String
    var techUid: String
    var packId: String
    var packVersion: Int
    var faultCode: String
    var status: Status
    var stepId: String
    var history: [Step]
    var acknowledgedStops: [String]
    var createdOffline: Bool
    var startedAt: Date
    var updatedAt: Date
}

extension DiagnosisEngine {
    /// The engine's progress as session steps (instruction text included so the record reads on its own).
    var sessionHistory: [SessionState.Step] {
        history.map { e in
            let (via, input): (String, String?) = switch e.via {
            case .tap: ("tap", nil)
            case .reading(let r): ("reading", r)
            case .note(let n): ("note", n)
            }
            let i = e.interpretation
            return SessionState.Step(stepId: e.stepId, instruction: e.instruction, answer: e.answer, via: via, input: input,
                                     source: i?.source.rawValue, latencyMs: i?.latencyMs, model: i?.modelVersion,
                                     confidence: i?.decision.confidence, say: i?.decision.say)
        }
    }

    var sessionStatus: SessionState.Status { phase == .concluded ? .concluded : .active }
}
