import Foundation
import Observation

/// Writes a report body with a model. Injected so the upgrade logic is testable.
protocol ReportWriting: Sendable {
    func write(_ prompt: ReportPrompt.Built, route: InferenceRoute) async throws -> AIResult<ReportContent>
}

/// Firebase AI Logic hybrid session with @Generable output, validated in code; one JSON-in-text
/// attempt if structured generation fails.
nonisolated struct HybridReportWriter: ReportWriting {
    let ai: AIService
    let cloudModel: String

    struct Invalid: Error {}

    func write(_ prompt: ReportPrompt.Built, route: InferenceRoute) async throws -> AIResult<ReportContent> {
        do {
            let r = try await ai.respond(prompt.user, generating: ServiceReportDraft.self, instructions: prompt.system,
                                         route: route, cloudModel: cloudModel)
            let content = try ReportContentValidator.validate(r.content).get()
            return AIResult(content: content, source: r.source, modelVersion: r.modelVersion, latencyMs: r.latencyMs)
        } catch {
            let r = try await ai.respondText(prompt.user, instructions: prompt.system, route: route, cloudModel: cloudModel)
            guard case .success(let content) = ReportContentValidator.parse(text: r.content) else { throw Invalid() }
            return AIResult(content: content, source: r.source, modelVersion: r.modelVersion, latencyMs: r.latencyMs)
        }
    }
}

/// Report generation and the cloud upgrade.
///  - Online: the Remote Config route (cloud first) writes a full report.
///  - Offline: the on-device model writes a short draft; with no model at all, a plain report is
///    assembled from the facts. Either way the tech leaves with a report.
///  - Back online: a draft is rewritten in the cloud once (automatically if `auto_upgrade_reports`,
///    otherwise on tap). Both versions are kept; a failed upgrade leaves the draft as it was.
@Observable
final class ReportService {
    struct Event: Equatable {
        let ok: Bool
        let source: InferenceSource?
        let latencyMs: Int
        let tokenEstimate: Int
        let model: String?
        let route: InferenceRoute
    }

    private(set) var writing: Set<String> = []
    private(set) var upgrading: Set<String> = []
    private(set) var upgradeFailed: Set<String> = []

    private let writer: () -> any ReportWriting
    private let save: (ServiceReport) -> Void
    private let isOnline: () -> Bool
    private let autoUpgradeEnabled: () -> Bool
    private let route: () -> InferenceRoute
    private let template: PromptTemplate?
    private var autoAttempted: Set<String> = []
    var onEvent: ((Event) -> Void)?

    init(writer: @escaping () -> any ReportWriting, save: @escaping (ServiceReport) -> Void,
         isOnline: @escaping () -> Bool, autoUpgradeEnabled: @escaping () -> Bool,
         route: @escaping () -> InferenceRoute,
         template: PromptTemplate? = try? PromptTemplate.load(named: "report")) {
        self.writer = writer
        self.save = save
        self.isOnline = isOnline
        self.autoUpgradeEnabled = autoUpgradeEnabled
        self.route = route
        self.template = template
    }

    /// Writes the first version of the report for a session (or a new version of an existing one).
    @discardableResult
    func generate(facts: ReportFacts, jobId: String, sessionId: String, techUid: String,
                  existing: ServiceReport? = nil, now: Date = Date()) async -> ServiceReport {
        let id = ServiceReport.id(forSession: sessionId)
        writing.insert(id)
        defer { writing.remove(id) }

        let online = isOnline()
        var version: ReportVersion?
        // Online: the configured route (cloud first). Offline, or if that fails: on-device only.
        let attempts: [(InferenceRoute, Int, String)] = online
            ? [(route(), ReportPrompt.fullWords, "full"), (.onlyOnDevice, ReportPrompt.draftWords, "draft")]
            : [(.onlyOnDevice, ReportPrompt.draftWords, "draft")]
        for (route, words, kind) in attempts where version == nil {
            version = await attempt(facts, route: route, words: words, kind: kind, now: now)
        }
        let final = version ?? ReportVersion(generatedBy: "PLAIN", model: nil, kind: "draft", createdAt: now,
                                             latencyMs: nil, content: ReportContentValidator.plain(from: facts))
        var report = existing ?? ServiceReport(
            id: id, jobId: jobId, sessionId: sessionId, techUid: techUid, facts: facts, versions: [],
            status: .draft, generatedBy: final.generatedBy, createdOffline: !online, createdAt: now, updatedAt: now)
        report.facts = facts
        report.add(final, now: now)
        save(report)
        return report
    }

    func needsUpgrade(_ r: ServiceReport) -> Bool { r.status == .draft }

    /// Rewrites a draft in the cloud. Returns the upgraded report, or nil (draft unchanged).
    @discardableResult
    func upgrade(_ report: ServiceReport, now: Date = Date()) async -> ServiceReport? {
        guard needsUpgrade(report), isOnline(), !upgrading.contains(report.id), !writing.contains(report.id) else { return nil }
        upgrading.insert(report.id)
        upgradeFailed.remove(report.id)
        defer { upgrading.remove(report.id) }
        guard let v = await attempt(report.facts, route: .onlyInCloud, words: ReportPrompt.fullWords, kind: "full", now: now) else {
            upgradeFailed.insert(report.id)
            return nil
        }
        var upgraded = report
        upgraded.add(v, now: now)
        upgraded.upgradedAt = now
        save(upgraded)
        return upgraded
    }

    /// After reconnecting (or relaunching online): one automatic attempt per draft per launch.
    func autoUpgrade(_ drafts: [ServiceReport]) async {
        guard autoUpgradeEnabled(), isOnline() else { return }
        for r in drafts where needsUpgrade(r) && !autoAttempted.contains(r.id) {
            autoAttempted.insert(r.id)
            await upgrade(r)
        }
    }

    private func attempt(_ facts: ReportFacts, route: InferenceRoute, words: Int, kind: String, now: Date) async -> ReportVersion? {
        guard let template, let prompt = try? ReportPrompt.build(facts, maxWords: words, template: template) else { return nil }
        do {
            let r = try await writer().write(prompt, route: route)
            onEvent?(Event(ok: true, source: r.source, latencyMs: r.latencyMs, tokenEstimate: prompt.tokenEstimate,
                           model: r.modelVersion, route: route))
            // A cloud-first route can still answer on-device; record what actually wrote it.
            let kindWritten = r.source == .inCloud ? "full" : "draft"
            return ReportVersion(generatedBy: r.source.rawValue, model: r.modelVersion, kind: kind == "full" ? kindWritten : kind,
                                 createdAt: now, latencyMs: r.latencyMs, content: r.content)
        } catch {
            onEvent?(Event(ok: false, source: nil, latencyMs: 0, tokenEstimate: prompt.tokenEstimate, model: nil, route: route))
            return nil
        }
    }
}
