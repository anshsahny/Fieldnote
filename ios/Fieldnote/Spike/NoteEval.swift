#if DEBUG
import Foundation

/// P3 note sample, run headless from launch arguments (P6 grows this into the full harness):
///   -FNRunEval p3-notes            scenario file eval/scenarios/p3-notes.json (bundled)
///   -FNEvalRoute only_on_device    forced route (default prefer_on_device)
/// Each note goes through the real HybridInterpreter (Firebase AI Logic) with the same prompt and
/// validation as the app, then the engine's rule: unclear or confidence < threshold => clarify.
/// Output: one `FNEVAL {json}` line per note and an `FNEVAL_SUMMARY {json}` line.
enum NoteEval {
    private struct Scenario: Decodable {
        let id, packId, stepId, note, expect: String
        /// Optional earlier answers as [stepId, answer] pairs, so the prompt carries the same
        /// history it would mid-diagnosis.
        let history: [[String]]?
    }
    private struct File: Decodable { let version: Int; let notes: [Scenario] }

    /// Runs the sample and returns the summary (also printed), so the Diagnostics sheet can show it.
    @discardableResult
    static func run(name: String, route: InferenceRoute) async -> [String: String] {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "scenarios"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(File.self, from: data),
              let template = try? PromptTemplate.load(named: "diagnosis") else {
            let error = ["error": "scenario \(name) or diagnosis prompt not found"]
            emit("FNEVAL_SUMMARY", error)
            return error
        }
        let packs = Dictionary(uniqueKeysWithValues: BundledPacks.load().map { ($0.packId, $0) })
        let config = await AIConfigLoader().load()
        let threshold = config.confidenceThreshold
        let interpreter = HybridInterpreter(ai: AIService(), route: route, cloudModel: config.cloudModel(for: .diagnosis))

        var correct = 0, clarified = 0, failures = 0, clearTotal = 0, hedgedTotal = 0, hedgedClarified = 0
        var onDeviceLatencies: [Int] = [], allLatencies: [Int] = [], misses: [String] = []
        for s in file.notes {
            let history = (s.history ?? []).compactMap { pair -> DiagnosisPrompt.HistoryLine? in
                guard pair.count == 2, let earlier = packs[s.packId]?.steps[pair[0]] else { return nil }
                return .init(instruction: earlier.instruction, answer: pair[1])
            }
            guard let step = packs[s.packId]?.steps[s.stepId],
                  let prompt = try? DiagnosisPrompt.build(step: step, history: history, note: s.note, template: template) else {
                emit("FNEVAL", ["id": s.id, "error": "unknown step \(s.packId)/\(s.stepId)"])
                failures += 1
                continue
            }
            do {
                let r = try await interpreter.interpret(prompt)
                let d = r.decision
                let asks = DiagnosisEngine.clarification(for: d, note: s.note, threshold: threshold) != nil
                let outcome = asks ? "clarify" : d.choice
                let ok = outcome == s.expect
                if s.expect == "clarify" {
                    hedgedTotal += 1
                    if asks { hedgedClarified += 1 }
                } else {
                    clearTotal += 1
                }
                if ok { correct += 1 } else { misses.append("\(s.id)→\(outcome)") }
                if asks { clarified += 1 }
                allLatencies.append(r.latencyMs)
                if r.source == .onDevice { onDeviceLatencies.append(r.latencyMs) }
                emit("FNEVAL", ["id": s.id, "expect": s.expect, "choice": d.choice,
                                "confidence": String(format: "%.2f", d.confidence), "outcome": outcome,
                                "ok": "\(ok)", "source": r.source.rawValue, "latencyMs": "\(r.latencyMs)",
                                "tokens": "\(prompt.tokenEstimate)"])
            } catch {
                failures += 1
                emit("FNEVAL", ["id": s.id, "error": String(describing: error)])
            }
        }
        let summary = [
            "route": route.rawValue, "promptVersion": "\(template.meta.version)", "threshold": "\(threshold)",
            "notes": "\(file.notes.count)", "correct": "\(correct)", "failures": "\(failures)",
            "clarifyRate": "\(clarified)/\(file.notes.count)",
            "clearNotesAutoAnswered": "\(clearTotal - (clarified - hedgedClarified))/\(clearTotal)",
            "hedgedNotesClarified": "\(hedgedClarified)/\(hedgedTotal)",
            "onDeviceTurns": "\(onDeviceLatencies.count)",
            "medianOnDeviceMs": median(onDeviceLatencies).map(String.init) ?? "n/a",
            "medianAllMs": median(allLatencies).map(String.init) ?? "n/a",
            "misses": misses.isEmpty ? "none" : misses.joined(separator: ", "),
        ]
        emit("FNEVAL_SUMMARY", summary)
        return summary
    }

    private static func median(_ values: [Int]) -> Int? {
        guard !values.isEmpty else { return nil }
        let s = values.sorted()
        return s.count % 2 == 1 ? s[s.count / 2] : (s[s.count / 2 - 1] + s[s.count / 2]) / 2
    }

    private static func emit(_ tag: String, _ fields: [String: String]) {
        if let data = try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]),
           let json = String(data: data, encoding: .utf8) {
            print("\(tag) \(json)")
        }
    }
}
#endif
