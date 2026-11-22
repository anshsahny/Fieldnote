import FirebaseFirestore
import Foundation
import Testing
@testable import Fieldnote

/// Scripted report writer: returns a result per route (or throws), and records every call.
final class MockReportWriter: ReportWriting, @unchecked Sendable {
    private let lock = NSLock()
    private var _routes: [InferenceRoute] = []
    var routes: [InferenceRoute] { lock.withLock { _routes } }
    let results: [InferenceRoute: InferenceSource]
    let delay: Duration

    init(_ results: [InferenceRoute: InferenceSource], delay: Duration = .zero) {
        self.results = results
        self.delay = delay
    }

    struct Down: Error {}

    func write(_ prompt: ReportPrompt.Built, route: InferenceRoute) async throws -> AIResult<ReportContent> {
        lock.withLock { _routes.append(route) }
        if delay > .zero { try? await Task.sleep(for: delay) }
        guard let source = results[route] else { throw Down() }
        let content = ReportContent(summary: "\(source.rawValue) report.", workPerformed: ["Checked the flue."],
                                    findings: ["Flue blocked."], recommendations: [], safetyNotes: [])
        return AIResult(content: content, source: source,
                        modelVersion: source == .onDevice ? InferenceSource.onDeviceModelVersion : "gemini-3.5-flash-lite",
                        latencyMs: source == .onDevice ? 900 : 1800)
    }
}

struct ReportTests {
    nonisolated static let packs = BundledPacks.load()
    let goodman = packs.first { $0.brand == "Goodman" }!
    let template = try! PromptTemplate.load(named: "report")

    var job: Job {
        Job(id: "j1", data: [
            "customer": ["name": "Rosa Okafor", "phone": "416-555-0142", "address": "14 Demo Crescent, Etobicoke"],
            "equipment": ["brand": "Goodman", "model": "GMVC960803BN", "serial": "1712345678"],
            "reported": "No heat", "status": "assigned",
        ])
    }

    /// Goodman EE0 to the blocked-flue conclusion, with a note and a safety stop on the way.
    func concluded() async -> DiagnosisEngine {
        let e = DiagnosisEngine(pack: goodman, fault: goodman.faultCodes.first { $0.code == "EE0" }!,
                                interpreter: MockInterpreter(.answer("gas supply ok", 0.9, "ok")), confidenceThreshold: 0.7)
        await e.submitNote("Rosa at 14 Demo Crescent says the meter is on, call 416-555-0142")
        await e.submitNote("I smell gas")
        e.acknowledgeSafety()
        for option in ["normal", "good", "clean", "blocked"] { e.tap(option) }
        #expect(e.phase == .concluded)
        return e
    }

    // MARK: Privacy and size

    @Test func promptCarriesNoCustomerDetailsOrNotes() async throws {
        let facts = ReportFacts.from(engine: await concluded(), equipmentModel: job.model)
        let prompt = try ReportPrompt.build(facts, maxWords: ReportPrompt.fullWords, template: template)
        let factsJSON = String(decoding: try JSONEncoder().encode(facts), as: UTF8.self)
        for text in [prompt.system + prompt.user, factsJSON] {
            for secret in ["Rosa", "Okafor", "Demo Crescent", "Etobicoke", "416-555-0142", "1712345678", "meter is on"] {
                #expect(!text.contains(secret), "\(secret) leaked into the report input")
            }
        }
        #expect(prompt.user.contains("Goodman GMVC960803BN"))
        #expect(prompt.user.contains("EE0"))
        #expect(prompt.user.contains("blocked"))
        #expect(prompt.user.contains("under \(ReportPrompt.fullWords) words"))
        #expect(facts.safety.count == 1)
    }

    /// Every conclusion in every pack fits the on-device budget, even as a full-length request.
    @Test(arguments: packs.map(\.packId))
    func everyConclusionFitsTheOnDeviceBudget(packId: String) throws {
        let pack = Self.packs.first { $0.packId == packId }!
        var worst = 0
        for fault in pack.faultCodes {
            func walk(_ path: [String]) throws {
                let e = DiagnosisEngine(pack: pack, fault: fault, interpreter: nil, confidenceThreshold: 0.7)
                for option in path { e.tap(option) }
                if e.phase == .concluded {
                    let facts = ReportFacts.from(engine: e, equipmentModel: "MODEL-123")
                    worst = max(worst, try ReportPrompt.build(facts, maxWords: ReportPrompt.fullWords, template: template).tokenEstimate)
                    return
                }
                for option in e.allowedAnswers { try walk(path + [option]) }
            }
            try walk([])
        }
        #expect(worst > 0 && worst <= 3000, "worst \(worst)")
    }

    @Test func validatorBoundsLengthAndCounts() throws {
        let long = String(repeating: "word ", count: 300)
        let c = try ReportContentValidator.validate(
            summary: "  " + long, workPerformed: Array(repeating: long, count: 12) + ["", "  "], findings: ["ok"],
            recommendations: [], safetyNotes: []).get()
        #expect(c.summary.count == ReportContentValidator.maxSummaryChars)
        #expect(c.workPerformed.count == ReportContentValidator.maxItems)
        #expect(c.workPerformed.allSatisfy { $0.count <= ReportContentValidator.maxItemChars })
        #expect(ReportContentValidator.validate(summary: " ", workPerformed: [], findings: [], recommendations: [], safetyNotes: [])
                == .failure(.emptySummary))
        let parsed = try ReportContentValidator.parse(
            text: "Here you go:\n```json\n{\"summary\":\"Done.\",\"workPerformed\":[\"a\"],\"findings\":[],\"recommendations\":[],\"safetyNotes\":[]}\n```").get()
        #expect(parsed.summary == "Done.")
        #expect(ReportContentValidator.parse(text: "no json") == .failure(.noJSON))
    }

    @Test func plainReportNeedsNoModel() async {
        let facts = ReportFacts.from(engine: await concluded(), equipmentModel: job.model)
        let plain = ReportContentValidator.plain(from: facts)
        #expect(plain.summary.contains("EE0"))
        #expect(plain.workPerformed.count == 5)
        #expect(!plain.recommendations.isEmpty && !plain.safetyNotes.isEmpty)
    }

    @Test func reportRoundTripsThroughCodable() async throws {
        let (service, saved, _) = makeService(MockReportWriter([.onlyOnDevice: .onDevice]), online: false)
        _ = service
        let r = await service.generate(facts: ReportFacts.from(engine: await concluded(), equipmentModel: job.model),
                                       jobId: "j1", sessionId: "s1", techUid: "tech")
        let decoded = try JSONDecoder().decode(ServiceReport.self, from: try JSONEncoder().encode(r))
        #expect(decoded == r && saved.value.last == r)
    }

    // MARK: Generation and upgrade

    final class Box<T>: @unchecked Sendable { var value: T; init(_ v: T) { value = v } }

    func makeService(_ writer: MockReportWriter, online: Bool, auto: Bool = true)
        -> (ReportService, Box<[ServiceReport]>, Box<Bool>) {
        let saved = Box<[ServiceReport]>([])
        let isOnline = Box(online)
        let service = ReportService(writer: { writer }, save: { saved.value.append($0) },
                                    isOnline: { isOnline.value }, autoUpgradeEnabled: { auto },
                                    route: { .preferInCloud }, template: template)
        return (service, saved, isOnline)
    }

    func facts() async -> ReportFacts { ReportFacts.from(engine: await concluded(), equipmentModel: job.model) }

    @Test func offlineWritesAnOnDeviceDraft() async {
        let writer = MockReportWriter([.onlyOnDevice: .onDevice])
        let (service, saved, _) = makeService(writer, online: false)
        let r = await service.generate(facts: await facts(), jobId: "j1", sessionId: "s1", techUid: "tech")
        #expect(writer.routes == [.onlyOnDevice])
        #expect(r.status == .draft && r.generatedBy == "ON_DEVICE" && r.current?.kind == "draft" && r.createdOffline)
        #expect(saved.value.count == 1)
    }

    @Test func onlineUsesTheCloudFirstRoute() async {
        let writer = MockReportWriter([.preferInCloud: .inCloud])
        let (service, _, _) = makeService(writer, online: true)
        let r = await service.generate(facts: await facts(), jobId: "j1", sessionId: "s1", techUid: "tech")
        #expect(writer.routes == [.preferInCloud])
        #expect(r.status == .final && r.generatedBy == "IN_CLOUD" && r.current?.kind == "full")
    }

    @Test func noModelAtAllStillLeavesAPlainReport() async {
        let writer = MockReportWriter([:])
        let (service, _, _) = makeService(writer, online: true)
        let r = await service.generate(facts: await facts(), jobId: "j1", sessionId: "s1", techUid: "tech")
        #expect(writer.routes == [.preferInCloud, .onlyOnDevice])
        #expect(r.generatedBy == "PLAIN" && r.status == .draft)
    }

    @Test func draftPlusSignalUpgradesInTheCloudExactlyOnce() async {
        let writer = MockReportWriter([.onlyOnDevice: .onDevice, .onlyInCloud: .inCloud], delay: .milliseconds(50))
        let (service, saved, online) = makeService(writer, online: false)
        let draft = await service.generate(facts: await facts(), jobId: "j1", sessionId: "s1", techUid: "tech")
        online.value = true
        // Reconnect and a cache refresh arrive together: two triggers, one cloud call.
        async let a: Void = service.autoUpgrade([draft])
        async let b: Void = service.autoUpgrade([draft])
        _ = await (a, b)
        await service.autoUpgrade([draft])
        #expect(writer.routes == [.onlyOnDevice, .onlyInCloud])
        let upgraded = saved.value.last!
        #expect(upgraded.status == .final && upgraded.upgradedAt != nil)
        #expect(upgraded.versions.map(\.generatedBy) == ["ON_DEVICE", "IN_CLOUD"])
    }

    @Test func failedUpgradeKeepsTheDraft() async {
        let writer = MockReportWriter([.onlyOnDevice: .onDevice])
        let (service, saved, online) = makeService(writer, online: false)
        let draft = await service.generate(facts: await facts(), jobId: "j1", sessionId: "s1", techUid: "tech")
        online.value = true
        let result = await service.upgrade(draft)
        #expect(result == nil)
        #expect(saved.value == [draft])
        #expect(service.upgradeFailed.contains(draft.id))
    }

    @Test func noUpgradeOfflineWhenDisabledOrAlreadyFinal() async {
        let writer = MockReportWriter([.onlyOnDevice: .onDevice, .onlyInCloud: .inCloud, .preferInCloud: .inCloud])
        let (offline, _, _) = makeService(writer, online: false)
        let draft = await offline.generate(facts: await facts(), jobId: "j1", sessionId: "s1", techUid: "tech")
        await offline.autoUpgrade([draft])

        let (manualOnly, _, _) = makeService(writer, online: true, auto: false)
        await manualOnly.autoUpgrade([draft])

        let (online, _, _) = makeService(writer, online: true)
        let final = await online.generate(facts: await facts(), jobId: "j2", sessionId: "s2", techUid: "tech")
        await online.autoUpgrade([final])
        #expect(writer.routes == [.onlyOnDevice, .preferInCloud])

        // Manual upgrade still works with auto off.
        #expect(await manualOnly.upgrade(draft)?.status == .final)
    }
}
