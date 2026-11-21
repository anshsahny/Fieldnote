import Foundation
import Observation

/// What the model returned for one note, after validation in code.
nonisolated struct Interpretation: Sendable, Equatable {
    let decision: ValidatedDecision
    let source: InferenceSource
    let modelVersion: String
    let latencyMs: Int
}

/// The AI step that maps a technician's note to one of the allowed answers. Injected so the engine
/// is testable and so "no AI" (plain mode) is just `nil`.
protocol ObservationInterpreter: Sendable {
    func interpret(_ prompt: DiagnosisPrompt.Built) async throws -> Interpretation
}

/// Things the app records (ledger rows, haptics). Metadata only.
nonisolated enum EngineEvent: Sendable, Equatable {
    case inference(ok: Bool, source: InferenceSource?, latencyMs: Int, tokenEstimate: Int, model: String?)
    case safetyStop(id: String)
}

/// State machine over a fix pack's step graph. Facts and branching come from the pack; safety is
/// code; the model only maps free text onto the current step's allowed answers.
@Observable
final class DiagnosisEngine {
    enum Phase: Equatable {
        case answering
        case interpreting
        /// The note didn't map cleanly; the tech taps one of the allowed answers.
        case clarifying(Clarification)
        case safetyStop(FixPack.SafetyStop)
        case concluded
    }

    enum Clarification: Equatable {
        case unclear(say: String?)
        case lowConfidence(choice: String, confidence: Double, say: String?)
        /// The model was confident but the tech's own words were a guess ("might be ok").
        case hedged(choice: String, say: String?)
        /// No AI available (both routes failed, or plain mode): taps only, never a dead end.
        case aiUnavailable
    }

    enum Via: Equatable, Sendable {
        case tap
        case reading(String)
        case note(String)
    }

    struct Entry: Identifiable, Equatable {
        let id = UUID()
        let stepId: String
        let instruction: String
        let answer: String
        let via: Via
        let interpretation: Interpretation?
    }

    let pack: FixPack
    let fault: FixPack.FaultCode
    let startedAt: Date
    private(set) var stepId: String
    private(set) var phase: Phase = .answering
    private(set) var history: [Entry] = []
    private(set) var acknowledgedStops: [String] = []
    private(set) var lastNoteInterpretation: Interpretation?

    var onEvent: ((EngineEvent) -> Void)?

    private let interpreter: (any ObservationInterpreter)?
    private let safety: SafetyGuard
    private let template: PromptTemplate?
    private let confidenceThreshold: Double

    init(pack: FixPack, fault: FixPack.FaultCode, interpreter: (any ObservationInterpreter)?,
         confidenceThreshold: Double, template: PromptTemplate? = try? PromptTemplate.load(named: "diagnosis"),
         safety: SafetyGuard? = nil, now: Date = Date()) {
        self.pack = pack
        self.fault = fault
        self.interpreter = interpreter
        self.confidenceThreshold = confidenceThreshold
        self.template = template
        self.safety = safety ?? SafetyGuard(packStops: pack.safetyStops)
        self.stepId = fault.firstStep
        self.startedAt = now
        if pack.steps[fault.firstStep]?.outcome != nil { phase = .concluded }
    }

    var step: FixPack.Step { pack.steps[stepId]! }
    var allowedAnswers: [String] { step.ask?.options ?? [] }
    var outcome: FixPack.Outcome? { step.outcome }
    var isPlainMode: Bool { interpreter == nil }
    /// Steps answered so far (leaf excluded).
    var stepNumber: Int { history.count + 1 }
    /// Numeric entry is offered when every option parses into a range.
    var readingRanges: [(option: String, range: ReadingRange)]? {
        guard step.ask?.type == .reading else { return nil }
        return ReadingRange.ranges(for: allowedAnswers)
    }
    var cautionStop: FixPack.SafetyStop? {
        step.safety.flatMap { id in pack.safetyStops.first { $0.id == id } }
    }

    // MARK: Inputs

    func tap(_ option: String) {
        guard phase != .concluded, phase != .interpreting, !isSafetyStop, allowedAnswers.contains(option) else { return }
        advance(with: option, via: .tap, interpretation: nil)
    }

    /// Returns false if the value doesn't fall in exactly one option's range (the tech taps instead).
    @discardableResult
    func enterReading(_ value: Double) -> Bool {
        guard phase != .concluded, !isSafetyStop, let option = ReadingRange.option(for: value, options: allowedAnswers) else {
            return false
        }
        let unit = step.ask?.unit.map { " \($0)" } ?? ""
        advance(with: option, via: .reading("\(value.formatted())\(unit)"), interpretation: nil)
        return true
    }

    func submitNote(_ raw: String) async {
        let note = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !note.isEmpty, phase != .concluded, phase != .interpreting, !isSafetyStop else { return }

        // 1. Safety is code and runs before any model call.
        if let stop = safety.check(note) {
            phase = .safetyStop(stop)
            onEvent?(.safetyStop(id: stop.id))
            return
        }
        // 2. Plain mode: no model; ask the tech to tap.
        guard let interpreter, let template else {
            phase = .clarifying(.aiUnavailable)
            return
        }
        // 3. Prompt with only this step, its answers, and recent history.
        let prompt: DiagnosisPrompt.Built
        do {
            prompt = try DiagnosisPrompt.build(step: step, history: history.map { .init(instruction: pack.steps[$0.stepId]?.instruction ?? "", answer: $0.answer) },
                                               note: note, template: template)
        } catch {
            phase = .clarifying(.aiUnavailable)
            return
        }
        phase = .interpreting
        let askedStep = stepId
        do {
            let result = try await interpreter.interpret(prompt)
            onEvent?(.inference(ok: true, source: result.source, latencyMs: result.latencyMs,
                                tokenEstimate: prompt.tokenEstimate, model: result.modelVersion))
            guard stepId == askedStep else { return }
            lastNoteInterpretation = result
            let d = result.decision
            // 4. Code decides whether the model's answer is usable.
            if let clarification = Self.clarification(for: d, note: note, threshold: confidenceThreshold) {
                phase = .clarifying(clarification)
            } else {
                advance(with: d.choice, via: .note(note), interpretation: result)
            }
        } catch {
            onEvent?(.inference(ok: false, source: nil, latencyMs: 0, tokenEstimate: prompt.tokenEstimate, model: nil))
            guard stepId == askedStep else { return }
            phase = .clarifying(.aiUnavailable)
        }
    }

    /// The tech confirms the hazard is handled (or was a false alarm) and continues on this step.
    func acknowledgeSafety() {
        guard case .safetyStop(let stop) = phase else { return }
        acknowledgedStops.append(stop.id)
        phase = .answering
    }

    /// The rule for when a model answer may advance the diagnosis. Shared with the eval runner so
    /// the eval measures exactly what the app does.
    static func clarification(for d: ValidatedDecision, note: String, threshold: Double) -> Clarification? {
        if d.choice == DiagnosisDecisionValidator.unclear { return .unclear(say: d.say) }
        if d.confidence < threshold { return .lowConfidence(choice: d.choice, confidence: d.confidence, say: d.say) }
        if HedgeDetector.isHedged(note) { return .hedged(choice: d.choice, say: d.say) }
        return nil
    }

    var canUndo: Bool { !history.isEmpty && phase != .interpreting && !isSafetyStop }

    /// Steps back over the last answer (tap, reading or note), e.g. when a note was misread.
    /// Returns the undone entry so the UI can put the note text back in the field.
    @discardableResult
    func undoLast() -> Entry? {
        guard canUndo, let last = history.popLast() else { return nil }
        stepId = last.stepId
        phase = .answering
        lastNoteInterpretation = nil
        return last
    }

    // MARK: Internals

    private var isSafetyStop: Bool {
        if case .safetyStop = phase { return true }
        return false
    }

    private func advance(with option: String, via: Via, interpretation: Interpretation?) {
        guard let next = step.next?[option], pack.steps[next] != nil else { return }
        history.append(Entry(stepId: stepId, instruction: step.instruction, answer: option, via: via, interpretation: interpretation))
        stepId = next
        phase = pack.steps[next]?.outcome != nil ? .concluded : .answering
    }
}
