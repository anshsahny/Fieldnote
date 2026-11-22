import FirebaseFirestore
import Foundation
import Observation

/// Saves each diagnosis session after every step and keeps the latest session per job, read from
/// Firestore's offline cache when there's no signal (so a killed app can resume).
@Observable
final class SessionStore {
    /// Latest known session per job id.
    private(set) var latest: [String: SessionState] = [:]

    private let sync: SyncMonitor
    private var orgId: String?
    private var listeners: [String: ListenerRegistration] = [:]

    init(sync: SyncMonitor) { self.sync = sync }

    func configure(orgId: String) {
        guard self.orgId != orgId else { return }
        listeners.values.forEach { $0.remove() }
        listeners = [:]
        latest = [:]
        self.orgId = orgId
    }

    /// Follows the sessions of the tech's jobs (a handful per day, so one small listener each).
    func follow(jobIds: [String]) {
        guard let orgId else { return }
        for (id, listener) in listeners where !jobIds.contains(id) {
            listener.remove()
            listeners[id] = nil
        }
        for jobId in jobIds where listeners[jobId] == nil {
            listeners[jobId] = Firestore.firestore().collection("orgs/\(orgId)/jobs/\(jobId)/sessions")
                .addSnapshotListener { [weak self] snap, _ in
                    guard let snap else { return }
                    let newest = snap.documents
                        .compactMap { try? $0.data(as: SessionState.self) }
                        .max { $0.updatedAt < $1.updatedAt }
                    Task { @MainActor in
                        guard let self, let newest else { return }
                        if (self.latest[jobId]?.updatedAt ?? .distantPast) <= newest.updatedAt {
                            self.latest[jobId] = newest
                        }
                    }
                }
        }
    }

    func save(_ state: SessionState) {
        guard let orgId else { return }
        latest[state.jobId] = state
        let ref = Firestore.firestore().document("orgs/\(orgId)/jobs/\(state.jobId)/sessions/\(state.id)")
        sync.track { done in
            do {
                try ref.setData(from: state) { done($0) }
            } catch {
                done(error)
            }
        }
    }
}
