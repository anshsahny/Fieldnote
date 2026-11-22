import Foundation
import Testing
@testable import Fieldnote

struct SessionStateTests {
    nonisolated static let packs = BundledPacks.load()
    let goodman = packs.first { $0.brand == "Goodman" }!
    let carrier = packs.first { $0.brand == "Carrier" }!

    func engine(_ pack: FixPack, _ code: String, _ interpreter: (any ObservationInterpreter)? = nil) -> DiagnosisEngine {
        DiagnosisEngine(pack: pack, fault: pack.faultCodes.first { $0.code == code }!, interpreter: interpreter, confidenceThreshold: 0.7)
    }

    func state(from e: DiagnosisEngine) -> SessionState {
        SessionState(id: "s1", jobId: "j1", techUid: "tech", packId: e.pack.packId, packVersion: e.pack.version,
                     faultCode: e.fault.code, status: e.sessionStatus, stepId: e.stepId, history: e.sessionHistory,
                     acknowledgedStops: e.acknowledgedStops, createdOffline: true,
                     startedAt: Date(timeIntervalSince1970: 1_795_000_000), updatedAt: Date(timeIntervalSince1970: 1_795_000_100))
    }

    /// A walk with a note (on-device interpretation), a safety stop and a reading.
    func walkedEngine() async -> DiagnosisEngine {
        let e = engine(goodman, "EE0", MockInterpreter(.answer("gas supply ok", 0.9, "Meter is on.")))
        await e.submitNote("meter valve is open")
        await e.submitNote("I smell gas")
        e.acknowledgeSafety()
        e.tap("normal")
        return e
    }

    @Test func roundTripsThroughCodable() async throws {
        let original = state(from: await walkedEngine())
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(SessionState.self, from: data)
        #expect(decoded == original)
        #expect(decoded.history.first?.via == "note" && decoded.history.first?.source == "ON_DEVICE")
        #expect(decoded.acknowledgedStops == ["GAS"])
    }

    @Test func restoresIntoAFreshEngine() async {
        let saved = state(from: await walkedEngine())
        let resumed = engine(goodman, "EE0")
        #expect(resumed.restore(saved))
        #expect(resumed.stepId == saved.stepId && resumed.phase == .answering)
        #expect(resumed.history.map(\.answer) == ["gas supply ok", "normal"])
        #expect(resumed.history.first?.via == .note("meter valve is open"))
        #expect(resumed.history.first?.interpretation?.source == .onDevice)
        #expect(resumed.acknowledgedStops == ["GAS"])
        #expect(state(from: resumed).history == saved.history)
    }

    @Test func restoresAConcludedSessionWithAReading() {
        let e = engine(carrier, "34")
        #expect(e.enterReading(0.3))
        #expect(e.phase == .concluded)
        let resumed = engine(carrier, "34")
        #expect(resumed.restore(state(from: e)))
        #expect(resumed.phase == .concluded && resumed.outcome != nil)
        #expect(resumed.history.first?.via == .reading("0.3 uA"))
    }

    @Test func refusesSessionsThatNoLongerMatchThePack() async {
        var saved = state(from: await walkedEngine())
        var wrongAnswer = saved
        wrongAnswer.history[1].answer = "not an option"
        #expect(!engine(goodman, "EE0").restore(wrongAnswer))

        var wrongStep = saved
        wrongStep.stepId = "CEE0-S5"
        #expect(!engine(goodman, "EE0").restore(wrongStep))

        saved.faultCode = "EE2"
        #expect(!engine(goodman, "EE0").restore(saved))
    }

    @Test func everyChangeAsksToBeSaved() async {
        let e = engine(goodman, "EE0", MockInterpreter(.answer("gas supply ok", 0.9, "ok")))
        var saves = 0
        e.onChange = { saves += 1 }
        await e.submitNote("meter valve is open")   // answer by note
        e.tap("normal")                              // answer by tap
        e.undoLast()                                 // undo
        await e.submitNote("I smell gas")            // stop: nothing to save yet
        e.acknowledgeSafety()                        // acknowledgement
        #expect(saves == 4)
    }
}
