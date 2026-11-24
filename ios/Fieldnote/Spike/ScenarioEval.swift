#if DEBUG
import Foundation
import UIKit

/// P6 evaluation on the iPhone: the 24 scenarios in eval/scenarios/p6-scenarios.json run through
/// the app's own pieces (SafetyGuard, DiagnosisPrompt, HybridInterpreter with a forced route,
/// DiagnosisEngine.clarification). Writes the same result format as web/src/eval/runner.ts.
///   -FNRunScenarios only_on_device | only_in_cloud | both   (-FNExitWhenDone YES)
/// Output: `FNSCENARIO {json}` per turn and `FNEVALRUN {json}` per route (the whole run).
enum ScenarioEval {
    struct Turn: Decodable { let note: String; let expect: String; let tap: String? }
    struct Scenario: Decodable {
        let id, packId, code, kind, conclusion: String
        let turns: [Turn]
    }
    private struct File: Decodable { let scenarios: [Scenario] }

    struct TurnResult: Codable, Sendable {
        let scenario: String
        let kind: String
        let turn: Int
        let expect: String
        let outcome: String
        let ok: Bool
        let modelCalled: Bool
        var source: String?
        var latencyMs: Int?
        var tokens: Int?
        var confidence: Double?
        var choice: String?
        var error: String?
    }

    struct Run: Codable, Sendable {
        let platform: String
        let route: String
        let device: String
        let startedAt: String
        let promptVersion: Int
        let threshold: Double
        let cloudModel: String
        let turns: [TurnResult]
    }

    static func loadScenarios() -> [Scenario] {
        guard let url = Bundle.main.url(forResource: "p6-scenarios", withExtension: "json", subdirectory: "scenarios"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(File.self, from: data) else { return [] }
        return file.scenarios
    }

    static var deviceName: String {
        if let sim = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] { return "\(sim) Simulator (iOS \(UIDevice.current.systemVersion))" }
        return "\(UIDevice.current.model) (iOS \(UIDevice.current.systemVersion))"
    }

    /// Runs every scenario on one route. `progress` reports turns done / total.
    static func run(route: InferenceRoute, progress: (@MainActor (Int, Int) -> Void)? = nil) async -> Run? {
        let scenarios = loadScenarios()
        guard !scenarios.isEmpty, let template = try? PromptTemplate.load(named: "diagnosis") else { return nil }
        let packs = Dictionary(uniqueKeysWithValues: BundledPacks.load().map { ($0.packId, $0) })
        let config = await AIConfigLoader().load()
        let interpreter = HybridInterpreter(ai: AIService(), route: route, cloudModel: config.cloudModel(for: .diagnosis))
        let total = scenarios.reduce(0) { $0 + $1.turns.count }
        var done = 0
        var results: [TurnResult] = []
        let started = ISO8601DateFormatter().string(from: Date())
        // The Gemini Developer API free tier allows 15 requests a minute: pace cloud turns at
        // about 13 a minute and wait out a 429 rather than scoring it as a model miss.
        let paced = route == .onlyInCloud || route == .preferInCloud
        var lastCall = ContinuousClock.now - .seconds(10)

        for s in scenarios {
            guard let pack = packs[s.packId], let fault = pack.faultCodes.first(where: { $0.code == s.code }) else { continue }
            let guardian = SafetyGuard(packStops: pack.safetyStops)
            var stepId = fault.firstStep
            var history: [DiagnosisPrompt.HistoryLine] = []
            for (i, turn) in s.turns.enumerated() {
                guard let step = pack.steps[stepId] else { break }
                var r: TurnResult
                if let stop = guardian.check(turn.note) {
                    let outcome = "safety:\(stop.id)"
                    r = TurnResult(scenario: s.id, kind: s.kind, turn: i + 1, expect: turn.expect, outcome: outcome,
                                   ok: outcome == turn.expect, modelCalled: false)
                } else if let prompt = try? DiagnosisPrompt.build(step: step, history: history, note: turn.note, template: template) {
                    do {
                        var attempt = 0
                        var interp: Interpretation
                        while true {
                            if paced { try? await Task.sleep(until: lastCall + .milliseconds(4_600)) }
                            lastCall = .now
                            do {
                                interp = try await interpreter.interpret(prompt)
                                break
                            } catch where attempt < 3 && Self.isRateLimit(error) {
                                attempt += 1
                                try? await Task.sleep(for: .seconds(20))
                            }
                        }
                        let d = interp.decision
                        let asks = DiagnosisEngine.clarification(for: d, note: turn.note, threshold: config.confidenceThreshold) != nil
                        let outcome = asks ? "clarify" : d.choice
                        r = TurnResult(scenario: s.id, kind: s.kind, turn: i + 1, expect: turn.expect, outcome: outcome,
                                       ok: outcome == turn.expect, modelCalled: true, source: interp.source.rawValue,
                                       latencyMs: interp.latencyMs, tokens: prompt.tokenEstimate, confidence: d.confidence, choice: d.choice)
                    } catch {
                        r = TurnResult(scenario: s.id, kind: s.kind, turn: i + 1, expect: turn.expect, outcome: "error",
                                       ok: false, modelCalled: true, error: String(String(describing: error).prefix(200)))
                    }
                } else {
                    r = TurnResult(scenario: s.id, kind: s.kind, turn: i + 1, expect: turn.expect, outcome: "error",
                                   ok: false, modelCalled: false, error: "prompt build failed")
                }
                results.append(r)
                emit("FNSCENARIO", r)
                done += 1
                await progress?(done, total)

                // Follow the expected path so every note is scored on its real step.
                let answer = (turn.expect == "clarify" || turn.expect.hasPrefix("safety:")) ? turn.tap : turn.expect
                if let answer, let next = step.next?[answer] {
                    history.append(.init(instruction: step.instruction, answer: answer))
                    stepId = next
                }
            }
        }
        let run = Run(platform: "ios", route: route.rawValue, device: deviceName, startedAt: started,
                      promptVersion: template.meta.version, threshold: config.confidenceThreshold,
                      cloudModel: config.cloudModel(for: .diagnosis), turns: results)
        emit("FNEVALRUN", run)
        return run
    }

    /// Writes the run to a temporary file for the Share sheet (AirDrop to the Mac).
    static func export(_ run: Run) -> URL? {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("ios-\(run.route)-\(run.startedAt.prefix(10)).json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(run), (try? data.write(to: url)) != nil else { return nil }
        return url
    }

    static func summary(_ run: Run) -> String {
        let t = run.turns
        let choice = t.filter { $0.expect != "clarify" && !$0.expect.hasPrefix("safety:") }
        let clarify = t.filter { $0.expect == "clarify" }
        let safety = t.filter { $0.expect.hasPrefix("safety:") }
        let latencies = t.compactMap { $0.outcome == "error" ? nil : $0.latencyMs }.sorted()
        let median = latencies.isEmpty ? 0 : latencies[latencies.count / 2]
        return "choice \(choice.filter(\.ok).count)/\(choice.count) · asked \(clarify.filter(\.ok).count)/\(clarify.count) · safety \(safety.filter(\.ok).count)/\(safety.count) · median \(median) ms"
    }

    private static func isRateLimit(_ error: Error) -> Bool {
        let text = String(describing: error)
        return text.contains("429") || text.contains("resourceExhausted")
    }

    private static func emit<T: Encodable>(_ tag: String, _ value: T) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        if let data = try? encoder.encode(value), let json = String(data: data, encoding: .utf8) {
            print("\(tag) \(json)")
        }
    }
}
#endif
