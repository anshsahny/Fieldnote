#if DEBUG
import CoreGraphics
import Foundation
import ImageIO
import Observation

nonisolated struct SpikeResult: Identifiable, Sendable, Encodable {
    let id = UUID()
    let name: String
    let route: String
    let source: String
    let modelVersion: String
    let latencyMs: Int?
    let pass: Bool
    let detail: String

    private enum CodingKeys: String, CodingKey { case name, route, source, modelVersion, latencyMs, pass, detail }
}

/// P1 hybrid spikes. Every call is a real Firebase AI Logic request; results are also printed
/// as `FNSPIKE {json}` lines so they can be collected from the Simulator or a device console.
@Observable
final class SpikeRunner {
    var results: [SpikeResult] = []
    var busy: String?
    var config: AIConfig
    var availability = AIService.onDeviceAvailability

    private let ai = AIService()
    private let configLoader = AIConfigLoader()

    static let faultCodes = [
        "1": "Lockout, failed ignition",
        "2": "Pressure switch stuck closed",
        "3": "Pressure switch stuck open",
        "4": "Open high limit",
        "5": "Flame sensed with no call for heat",
        "6": "Open rollout switch",
    ]
    static let diagnosisAllowed = ["runs", "does not run", "runs noisy"]
    static let diagnosisExpected = "does not run"

    init() { config = configLoader.current }

    func loadConfig() async {
        config = await configLoader.load()
        availability = AIService.onDeviceAvailability
        Self.log(["event": "config", "origin": config.origin.rawValue, "onDevice": availability,
                  "route_diagnosis": config.route(for: .diagnosis).rawValue, "cloud_model_fast": config.cloudModelFast])
    }

    // MARK: Spikes

    /// Vision OCR on a nameplate image, then the on-device-first nameplate prompt on the OCR text.
    func runNameplate(image: CGImage, label: String, route: InferenceRoute? = nil) async {
        let route = route ?? config.route(for: .nameplate)
        busy = "OCR + nameplate (\(label))"
        do {
            let ocrStart = ContinuousClock.now
            let lines = try await NameplateOCR.recognizeLines(in: image)
            let elapsed = (ContinuousClock.now - ocrStart).components
            let ocrMs = Int(elapsed.seconds * 1000 + elapsed.attoseconds / 1_000_000_000_000_000)
            let joined = lines.joined(separator: " ").uppercased()
            add(SpikeResult(name: "Vision OCR (\(label))", route: "on-device (Vision)", source: "ON_DEVICE",
                            modelVersion: "apple-vision", latencyMs: ocrMs,
                            pass: joined.contains("GOODMAN") && joined.contains("GMVC96"),
                            detail: lines.prefix(12).joined(separator: " | ")))

            let prompt = try PromptTemplate.load(named: "nameplate")
            let p = try prompt.render(["ocr_lines": lines.joined(separator: "\n")])
            let r = try await ai.respondText(p.user, instructions: p.system, route: route,
                                             cloudModel: config.cloudModel(for: .nameplate))
            add(SpikeResult(name: "Nameplate fields (\(label))", route: route.rawValue, source: r.source.rawValue,
                            modelVersion: r.modelVersion, latencyMs: r.latencyMs,
                            pass: r.content.uppercased().contains("GMVC960803BN"), detail: r.content))
        } catch {
            add(.failure("Nameplate (\(label))", route: route, error: error))
        }
        busy = nil
    }

    /// Structured output via @Generable, N fresh single-turn sessions.
    func runStructured(times: Int, route: InferenceRoute? = nil) async {
        let route = route ?? config.route(for: .diagnosis)
        var valid = 0, expected = 0, latencies: [Int] = [], sources: [String: Int] = [:], errors: [String] = []
        for i in 1...times {
            busy = "Structured \(i)/\(times)"
            do {
                let p = try diagnosisPrompt()
                let r = try await ai.respond(p.user, generating: DiagnosisDecision.self, instructions: p.system,
                                             route: route, cloudModel: config.cloudModel(for: .diagnosis))
                latencies.append(r.latencyMs)
                sources[r.source.rawValue, default: 0] += 1
                switch DiagnosisDecisionValidator.validate(r.content, allowed: Self.diagnosisAllowed) {
                case .success(let d):
                    valid += 1
                    if d.choice == Self.diagnosisExpected { expected += 1 }
                case .failure(let f):
                    errors.append("\(f)")
                }
            } catch {
                errors.append(error.localizedDescription)
            }
        }
        let avg = latencies.isEmpty ? nil : latencies.reduce(0, +) / latencies.count
        add(SpikeResult(name: "Structured @Generable ×\(times)", route: route.rawValue,
                        source: sources.map { "\($0.key)×\($0.value)" }.sorted().joined(separator: " "),
                        modelVersion: "", latencyMs: avg, pass: valid >= Int(Double(times) * 0.9),
                        detail: "valid \(valid)/\(times), expected choice \(expected)/\(times)"
                            + (errors.isEmpty ? "" : "; errors: \(errors.prefix(3).joined(separator: "; "))")))
        busy = nil
    }

    /// Fallback path: plain text response, JSON extracted and validated in code.
    func runJSONFallback(times: Int, route: InferenceRoute? = nil) async {
        let route = route ?? config.route(for: .diagnosis)
        var valid = 0, sources: [String: Int] = [:], last = ""
        for i in 1...times {
            busy = "JSON fallback \(i)/\(times)"
            do {
                let p = try diagnosisPrompt()
                let r = try await ai.respondText(p.user, instructions: p.system, route: route,
                                                 cloudModel: config.cloudModel(for: .diagnosis))
                sources[r.source.rawValue, default: 0] += 1
                last = r.content
                if case .success = DiagnosisDecisionValidator.parse(text: r.content, allowed: Self.diagnosisAllowed) {
                    valid += 1
                }
            } catch {
                last = error.localizedDescription
            }
        }
        add(SpikeResult(name: "JSON-in-text fallback ×\(times)", route: route.rawValue,
                        source: sources.map { "\($0.key)×\($0.value)" }.sorted().joined(separator: " "),
                        modelVersion: "", latencyMs: nil, pass: valid >= Int(Double(times) * 0.9),
                        detail: "valid \(valid)/\(times); last: \(last.prefix(160))"))
        busy = nil
    }

    /// Stretch probe: native function calling with a FoundationModels Tool through the hybrid session.
    func runTools(route: InferenceRoute) async {
        busy = "Tool calling (\(route.rawValue))"
        let recorder = ToolCallRecorder()
        let tool = FaultCodeLookupTool(table: Self.faultCodes, recorder: recorder)
        do {
            let r = try await ai.respondText(
                "The status LED on a Goodman GMVC96 furnace flashes 3 times, then pauses. "
                    + "Use the lookupFaultCode tool to find what that code means, then answer in one sentence.",
                instructions: "You help HVAC technicians. For LED flash codes, always call the lookupFaultCode tool; never guess.",
                route: route, cloudModel: config.cloudModel(for: .diagnosis), tools: [tool])
            let calls = await recorder.calls
            let pass = calls.contains("3") && r.content.lowercased().contains("pressure switch")
            add(SpikeResult(name: "Native tool call", route: route.rawValue, source: r.source.rawValue,
                            modelVersion: r.modelVersion, latencyMs: r.latencyMs, pass: pass,
                            detail: "tool calls: \(calls); answer: \(r.content)"))
        } catch {
            add(.failure("Native tool call", route: route, error: error))
        }
        busy = nil
    }

    /// Everything headless, for the Simulator / device console (launch arg -FNRunSpikes all).
    func runAll() async {
        await loadConfig()
        if let sample = Self.sampleNameplate() {
            await runNameplate(image: sample, label: "sample", route: config.route(for: .nameplate))
            await runNameplate(image: sample, label: "sample, cloud only", route: .onlyInCloud)
        }
        await runStructured(times: 10)
        await runJSONFallback(times: 3)
        await runTools(route: .onlyOnDevice)
        await runTools(route: config.route(for: .diagnosis))
        Self.log(["event": "done", "passed": "\(results.filter(\.pass).count)/\(results.count)"])
    }

    /// Airplane-mode run (launch arg -FNRunSpikes offline): the same prompts must still answer
    /// on-device, including a cloud-first route, which must fall back to the on-device model.
    func runOffline() async {
        await loadConfig()
        if let sample = Self.sampleNameplate() {
            await runNameplate(image: sample, label: "offline, on-device first", route: .preferOnDevice)
            await runNameplate(image: sample, label: "offline, cloud first", route: .preferInCloud)
        }
        await runStructured(times: 5)
        await runTools(route: .preferOnDevice)
        let onDevice = results.filter { $0.source.hasPrefix("ON_DEVICE") }.count
        Self.log(["event": "done", "passed": "\(results.filter(\.pass).count)/\(results.count)",
                  "onDeviceRows": "\(onDevice)/\(results.count)"])
    }

    // MARK: Helpers

    private func diagnosisPrompt() throws -> (system: String, user: String) {
        try PromptTemplate.load(named: "diagnosis").render([
            "step_instruction": "Check that the inducer motor runs on a call for heat.",
            "allowed_choices": Self.diagnosisAllowed.joined(separator: " | "),
            "history": "Thermostat calling for heat (W energized). Status LED: 3 flashes.",
            "note": "turned the stat up, the little fan motor on top isn't spinning at all, no hum either",
        ])
    }

    private func add(_ result: SpikeResult) {
        results.insert(result, at: 0)
        if let data = try? JSONEncoder().encode(result), let json = String(data: data, encoding: .utf8) {
            print("FNSPIKE \(json)")
        }
    }

    static func log(_ fields: [String: String]) {
        if let data = try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]),
           let json = String(data: data, encoding: .utf8) {
            print("FNSPIKE \(json)")
        }
    }

    static func sampleNameplate() -> CGImage? {
        guard let url = Bundle.main.url(forResource: "nameplate-gmvc96", withExtension: "png"),
              let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(src, 0, nil)
    }
}

extension SpikeResult {
    nonisolated static func failure(_ name: String, route: InferenceRoute, error: Error) -> SpikeResult {
        SpikeResult(name: name, route: route.rawValue, source: "ERROR", modelVersion: "", latencyMs: nil,
                    pass: false, detail: String(describing: error))
    }
}
#endif
