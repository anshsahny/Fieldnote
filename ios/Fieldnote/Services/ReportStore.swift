import FirebaseFirestore
import Foundation
import Observation

/// One model-written (or plain) version of a report. Every version keeps who wrote it.
nonisolated struct ReportVersion: Codable, Equatable, Sendable {
    /// ON_DEVICE | IN_CLOUD | PLAIN
    var generatedBy: String
    var model: String?
    /// draft (short, offline) | full
    var kind: String
    var createdAt: Date
    var latencyMs: Int?
    var content: ReportContent
}

/// orgs/{org}/reports/{id}: one per diagnosis session. Field names match the rule `validReport`.
nonisolated struct ServiceReport: Codable, Equatable, Sendable, Identifiable {
    enum Status: String, Codable, Sendable { case draft, final }

    var schemaVersion = 1
    var id: String
    var jobId: String
    var sessionId: String
    var techUid: String
    var facts: ReportFacts
    var versions: [ReportVersion]
    var status: Status
    var generatedBy: String
    var createdOffline: Bool
    var createdAt: Date
    var updatedAt: Date
    var upgradedAt: Date?

    static func id(forSession sessionId: String) -> String { "r-\(sessionId)" }

    var current: ReportVersion? { versions.last }

    /// Appends a version (keeping the first and the newest three, within the rule's limit of 4).
    mutating func add(_ v: ReportVersion, now: Date = Date()) {
        versions.append(v)
        if versions.count > 4 { versions = [versions[0]] + versions.suffix(3) }
        generatedBy = v.generatedBy
        status = v.generatedBy == InferenceSource.inCloud.rawValue ? .final : .draft
        updatedAt = now
    }
}

/// The tech's reports, from Firestore's offline cache when there's no signal.
@Observable
final class ReportStore {
    private(set) var reports: [String: ServiceReport] = [:]
    /// Called whenever the set of reports changes (drives auto-upgrade after a relaunch).
    var onChange: (() -> Void)?

    private let sync: SyncMonitor
    private var orgId: String?
    private var listener: ListenerRegistration?

    init(sync: SyncMonitor) { self.sync = sync }

    func listen(orgId: String, uid: String) {
        listener?.remove()
        self.orgId = orgId
        listener = Firestore.firestore().collection("orgs/\(orgId)/reports")
            .whereField("techUid", isEqualTo: uid)
            .addSnapshotListener { [weak self] snap, _ in
                guard let snap else { return }
                let list = snap.documents.compactMap { try? $0.data(as: ServiceReport.self) }
                Task { @MainActor in
                    guard let self else { return }
                    for r in list where (self.reports[r.id]?.updatedAt ?? .distantPast) <= r.updatedAt {
                        self.reports[r.id] = r
                    }
                    self.onChange?()
                }
            }
    }

    func report(forSession sessionId: String) -> ServiceReport? { reports[ServiceReport.id(forSession: sessionId)] }

    func latest(forJob jobId: String) -> ServiceReport? {
        reports.values.filter { $0.jobId == jobId }.max { $0.updatedAt < $1.updatedAt }
    }

    var drafts: [ServiceReport] { reports.values.filter { $0.status == .draft }.sorted { $0.createdAt < $1.createdAt } }

    func save(_ report: ServiceReport) {
        reports[report.id] = report
        guard let orgId else { return }
        let ref = Firestore.firestore().document("orgs/\(orgId)/reports/\(report.id)")
        sync.track { done in
            do {
                try ref.setData(from: report) { done($0) }
            } catch {
                done(error)
            }
        }
    }
}
