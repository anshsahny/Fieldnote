import Foundation
import Testing
@testable import Fieldnote

/// Scripted interpreter: records calls, returns a fixed decision or throws.
final class MockInterpreter: ObservationInterpreter, @unchecked Sendable {
    enum Mode { case answer(String, Double, String), unclear, fail }
    private let lock = NSLock()
    private var _calls: [DiagnosisPrompt.Built] = []
    var calls: [DiagnosisPrompt.Built] { lock.withLock { _calls } }
    let mode: Mode

    init(_ mode: Mode) { self.mode = mode }

    func interpret(_ prompt: DiagnosisPrompt.Built) async throws -> Interpretation {
        lock.withLock { _calls.append(prompt) }
        switch mode {
        case .answer(let choice, let confidence, let say):
            return Interpretation(decision: ValidatedDecision(choice: choice, confidence: confidence, say: say),
                                  source: .onDevice, modelVersion: InferenceSource.onDeviceModelVersion, latencyMs: 600)
        case .unclear:
            return Interpretation(decision: ValidatedDecision(choice: "unclear", confidence: 0.2, say: "Not sure which."),
                                  source: .onDevice, modelVersion: InferenceSource.onDeviceModelVersion, latencyMs: 600)
        case .fail:
            throw URLError(.notConnectedToInternet)
        }
    }
}

struct DiagnosisEngineTests {
    nonisolated static let packs = BundledPacks.load()
    let goodman = packs.first { $0.brand == "Goodman" }!
    let carrier = packs.first { $0.brand == "Carrier" }!

    func engine(_ pack: FixPack, code: String, _ interpreter: (any ObservationInterpreter)?) -> DiagnosisEngine {
        DiagnosisEngine(pack: pack, fault: pack.faultCodes.first { $0.code == code }!, interpreter: interpreter, confidenceThreshold: 0.6)
    }

    @Test(arguments: [
        "kind of breezy out today, vent might be ok",
        "rod looks maybe a little dark? hard to tell with this light",
        "not sure if it leaks",
        "I haven’t checked the wiring yet",
        "probably the hose",
    ])
    func hedgedNotesAreDetected(note: String) {
        #expect(HedgeDetector.isHedged(note))
    }

    @Test(arguments: [
        "blower wheel wobbles on the shaft",
        "sensor rod is shiny, no coating",
        "make sure the filter is new", // "sure" alone is not a hedge
        "mighty clean in there",       // word boundaries
    ])
    func confidentNotesAreNotHedged(note: String) {
        #expect(!HedgeDetector.isHedged(note))
    }

    @Test func confidentModelStillAsksWhenTheTechWasGuessing() async {
        let e = engine(carrier, code: "31", MockInterpreter(.answer("vent and wind clear", 0.9, "Vent seems fine.")))
        await e.submitNote("kind of breezy out today, vent might be ok")
        #expect(e.phase == .clarifying(.hedged(choice: "vent and wind clear", say: "Vent seems fine.")))
        #expect(e.history.isEmpty)
        e.tap("vent and wind clear")
        #expect(e.history.count == 1)
    }

    @Test func undoStepsBackOverTapsAndConclusions() {
        let e = engine(goodman, code: "EE0", nil)
        #expect(!e.canUndo)
        e.tap("gas supply ok")
        e.tap("normal")
        #expect(e.stepId == "CEE0-S3")
        let undone = e.undoLast()
        #expect(undone?.stepId == "CEE0-S2" && undone?.answer == "normal")
        #expect(e.stepId == "CEE0-S2" && e.phase == .answering && e.history.count == 1)
        e.tap("faulty")
        #expect(e.phase == .concluded)
        e.undoLast()
        #expect(e.stepId == "CEE0-S2" && e.phase == .answering && e.outcome == nil)
    }

    @Test func misreadNoteCanBeUndoneAndRetapped() async {
        // The iPhone case: "sensor rod is shiny, no coating" read as "oxidized" ends the diagnosis.
        let e = engine(goodman, code: "EE0", MockInterpreter(.answer("oxidized", 0.9, "Coating mentioned.")))
        for option in ["gas supply ok", "normal", "good"] { e.tap(option) }
        await e.submitNote("sensor rod is shiny, no coating")
        #expect(e.phase == .concluded)
        let undone = e.undoLast()
        #expect(undone?.via == .note("sensor rod is shiny, no coating"))
        #expect(e.stepId == "CEE0-S4" && e.phase == .answering)
        e.tap("clean")
        #expect(e.stepId == "CEE0-S5")
    }

    @Test func threePacksAreBundled() {
        #expect(Self.packs.map(\.brand) == ["Carrier", "Goodman", "Rheem"])
    }

    /// Every fault code in every pack can be walked to a conclusion by taps along every branch.
    @Test(arguments: packs.flatMap { p in p.faultCodes.map { (p.packId, $0.code) } })
    func everyBranchConcludes(packId: String, code: String) {
        let pack = Self.packs.first { $0.packId == packId }!
        func walk(_ path: [String]) -> Int {
            let e = engine(pack, code: code, nil)
            for option in path { e.tap(option) }
            if e.phase == .concluded { #expect(e.outcome != nil); return 1 }
            #expect(!e.allowedAnswers.isEmpty, "dead end at \(e.stepId)")
            return e.allowedAnswers.reduce(0) { $0 + walk(path + [$1]) }
        }
        #expect(walk([]) >= 2, "each code should have at least two outcomes")
    }

    @Test func noteAdvancesWhenTheModelIsConfident() async {
        let mock = MockInterpreter(.answer("gas interrupted", 0.9, "Gas was off at the meter."))
        let e = engine(goodman, code: "EE0", mock)
        var events: [EngineEvent] = []
        e.onEvent = { events.append($0) }
        await e.submitNote("the gas cock at the meter was turned off")
        #expect(mock.calls.count == 1)
        #expect(e.history.first?.answer == "gas interrupted")
        #expect(e.history.first?.interpretation?.source == .onDevice)
        #expect(events.count == 1)
    }

    @Test func safetyStopsBeforeAnyModelCall() async {
        let mock = MockInterpreter(.answer("gas supply ok", 0.99, "ok"))
        let e = engine(goodman, code: "EE0", mock)
        var events: [EngineEvent] = []
        e.onEvent = { events.append($0) }
        await e.submitNote("I smell gas")
        #expect(mock.calls.isEmpty)
        guard case .safetyStop(let stop) = e.phase else { Issue.record("expected a safety stop"); return }
        #expect(stop.id == "GAS")
        #expect(events == [.safetyStop(id: "GAS")])
        // Further input is blocked until acknowledged.
        e.tap(e.allowedAnswers[0])
        #expect(e.history.isEmpty)
        e.acknowledgeSafety()
        #expect(e.phase == .answering)
        #expect(e.acknowledgedStops == ["GAS"])
    }

    @Test func unclearOrLowConfidenceAsksTheTechToTap() async {
        let unclear = engine(goodman, code: "EE2", MockInterpreter(.unclear))
        await unclear.submitNote("hmm not sure")
        #expect(unclear.phase == .clarifying(.unclear(say: "Not sure which.")))
        #expect(unclear.history.isEmpty)

        let low = engine(goodman, code: "EE2", MockInterpreter(.answer("hose clear", 0.4, "Maybe clear?")))
        await low.submitNote("hose looks ok i think")
        guard case .clarifying(.lowConfidence(let choice, _, _)) = low.phase else { Issue.record("expected clarification"); return }
        #expect(choice == "hose clear")
        low.tap("hose clear")
        #expect(low.history.count == 1)
    }

    @Test func aiFailureFallsBackToTapsNeverDeadEnds() async {
        let e = engine(goodman, code: "EE2", MockInterpreter(.fail))
        var events: [EngineEvent] = []
        e.onEvent = { events.append($0) }
        await e.submitNote("hose is kinked behind the inducer")
        #expect(e.phase == .clarifying(.aiUnavailable))
        #expect(events.first == .inference(ok: false, source: nil, latencyMs: 0, tokenEstimate: events.first.flatMap { if case .inference(_, _, _, let t, _) = $0 { t } else { nil } } ?? 0, model: nil))
        e.tap(e.allowedAnswers[0])
        #expect(e.history.count == 1)
    }

    @Test func plainModeNeverCallsAModel() async {
        let e = engine(goodman, code: "EE2", nil)
        #expect(e.isPlainMode)
        await e.submitNote("hose is kinked")
        #expect(e.phase == .clarifying(.aiUnavailable))
    }

    @Test func readingsBranchInCodeNotByTheModel() {
        let e = engine(carrier, code: "34", MockInterpreter(.fail))
        // Walk to the reading step (C34-S1 is the first step of code 34).
        #expect(e.readingRanges != nil)
        #expect(e.enterReading(0.3))
        #expect(e.history.first?.answer == "below 0.5 uA")
        #expect(e.history.first?.via == .reading("0.3 uA"))
    }

    @Test func outOfEnumAnswersAreIgnored() {
        let e = engine(goodman, code: "EE2", nil)
        e.tap("replace the whole furnace")
        #expect(e.history.isEmpty)
    }
}

struct DiagnosisPromptTests {
    /// Every step of every pack, with a long note and three history items, fits the on-device budget.
    @Test func everyStepFitsTheOnDeviceBudget() throws {
        let template = try PromptTemplate.load(named: "diagnosis")
        let budget = Int(RemoteConfigTemplate.bundledDefaults()["ondevice_max_tokens"] ?? "3000") ?? 3000
        let note = String(repeating: "inducer hums but the wheel won't spin, hose looks fine ", count: 8)
        let history = Array(repeating: DiagnosisPrompt.HistoryLine(instruction: String(repeating: "x", count: 120), answer: "does not run"), count: 5)
        var worst = 0
        for pack in BundledPacks.load() {
            for step in pack.steps.values where step.ask != nil {
                let built = try DiagnosisPrompt.build(step: step, history: history, note: note, template: template)
                worst = max(worst, built.tokenEstimate)
                #expect(built.tokenEstimate <= budget, "\(pack.packId): \(built.tokenEstimate) tokens")
                #expect(built.user.contains(step.ask!.options.joined(separator: " | ")))
            }
        }
        #expect(worst > 0)
    }

    @Test func onlyTheLastThreeHistoryItemsAreSent() throws {
        let template = try PromptTemplate.load(named: "diagnosis")
        let step = BundledPacks.load()[0].steps.values.first { $0.ask != nil }!
        let history = (1...5).map { DiagnosisPrompt.HistoryLine(instruction: "step \($0)", answer: "a\($0)") }
        let built = try DiagnosisPrompt.build(step: step, history: history, note: "n", template: template)
        #expect(!built.user.contains("step 2"))
        #expect(built.user.contains("step 3 → a3"))
    }
}
