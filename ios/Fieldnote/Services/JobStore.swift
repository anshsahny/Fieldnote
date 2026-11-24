import FirebaseFirestore
import Foundation
import Observation

nonisolated struct Job: Identifiable, Hashable, Sendable {
    let id: String
    let customerName: String
    let phone: String
    let address: String
    let brand: String
    let model: String
    let serial: String
    let reported: String
    let priority: String
    let status: String
    let scheduledFor: Date?

    init(id: String, data: [String: Any]) {
        let customer = data["customer"] as? [String: Any] ?? [:]
        let equipment = data["equipment"] as? [String: Any] ?? [:]
        self.id = id
        customerName = customer["name"] as? String ?? "Customer"
        phone = customer["phone"] as? String ?? ""
        address = customer["address"] as? String ?? ""
        brand = equipment["brand"] as? String ?? ""
        model = equipment["model"] as? String ?? ""
        serial = equipment["serial"] as? String ?? ""
        reported = data["reported"] as? String ?? ""
        priority = data["priority"] as? String ?? "normal"
        status = data["status"] as? String ?? "scheduled"
        scheduledFor = (data["scheduledFor"] as? Timestamp)?.dateValue()
    }

    var knownEquipment: Bool { !model.isEmpty }
}

/// Today's jobs for the signed-in tech, served from Firestore's offline cache when there's no signal.
@Observable
final class JobStore {
    private(set) var jobs: [Job] = []
    private(set) var loaded = false
    private(set) var fromCache = false
    /// Why the list couldn't load (e.g. the account isn't allowed to read this org's jobs).
    private(set) var loadError: String?
    private var listener: ListenerRegistration?
    private var orgId: String?
    private var uid: String?
    private let sync: SyncMonitor
    /// Called with the job ids whenever the list changes (SessionStore follows their sessions).
    var onJobIds: (([String]) -> Void)?

    init(sync: SyncMonitor) { self.sync = sync }

    func listen(orgId: String, uid: String) {
        listener?.remove()
        self.orgId = orgId
        self.uid = uid
        listener = Firestore.firestore().collection("orgs/\(orgId)/jobs")
            .whereField("assignedTo", isEqualTo: uid)
            .addSnapshotListener(includeMetadataChanges: true) { [weak self] snap, error in
                guard let snap else {
                    let message = Self.message(for: error)
                    Task { @MainActor in
                        self?.loadError = message
                        self?.loaded = true
                    }
                    return
                }
                let jobs = snap.documents.map { Job(id: $0.documentID, data: $0.data()) }
                    .sorted { ($0.scheduledFor ?? .distantFuture) < ($1.scheduledFor ?? .distantFuture) }
                let cached = snap.metadata.isFromCache
                Task { @MainActor in
                    guard let self else { return }
                    let changed = self.jobs.map(\.id) != jobs.map(\.id)
                    self.jobs = jobs
                    self.fromCache = cached
                    self.loadError = nil
                    self.loaded = true
                    if changed { self.onJobIds?(jobs.map(\.id)) }
                }
            }
    }

    /// Pull to refresh after a failed load: listen again (a listener stops after an error).
    func retryIfFailed() {
        guard loadError != nil, let orgId, let uid else { return }
        listen(orgId: orgId, uid: uid)
    }

    nonisolated static func message(for error: Error?) -> String {
        let code = (error as NSError?).map { FirestoreErrorCode.Code(rawValue: $0.code) } ?? nil
        switch code {
        case .permissionDenied?: return "This account isn't allowed to see jobs for this company. Ask your dispatcher to check your access."
        case .unauthenticated?: return "Your sign-in expired. Sign out and sign in again."
        default: return "Jobs couldn't load. Pull down to try again."
        }
    }

    /// Techs may only touch progress fields (Firestore rules); queued while offline.
    func setStatus(_ status: String, for job: Job) {
        guard let orgId else { return }
        let ref = Firestore.firestore().document("orgs/\(orgId)/jobs/\(job.id)")
        sync.track { done in ref.updateData(["status": status, "updatedAt": Timestamp(date: Date())]) { done($0) } }
    }
}
