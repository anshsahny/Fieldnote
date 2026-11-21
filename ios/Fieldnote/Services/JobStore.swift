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
    private var listener: ListenerRegistration?
    private var orgId: String?

    func listen(orgId: String, uid: String) {
        listener?.remove()
        self.orgId = orgId
        listener = Firestore.firestore().collection("orgs/\(orgId)/jobs")
            .whereField("assignedTo", isEqualTo: uid)
            .addSnapshotListener(includeMetadataChanges: true) { [weak self] snap, _ in
                guard let snap else { return }
                let jobs = snap.documents.map { Job(id: $0.documentID, data: $0.data()) }
                    .sorted { ($0.scheduledFor ?? .distantFuture) < ($1.scheduledFor ?? .distantFuture) }
                let cached = snap.metadata.isFromCache
                Task { @MainActor in
                    self?.jobs = jobs
                    self?.fromCache = cached
                    self?.loaded = true
                }
            }
    }

    /// Techs may only touch progress fields (Firestore rules); queued while offline.
    func setStatus(_ status: String, for job: Job) {
        guard let orgId else { return }
        Firestore.firestore().document("orgs/\(orgId)/jobs/\(job.id)")
            .updateData(["status": status, "updatedAt": Timestamp(date: Date())]) { _ in }
    }
}
