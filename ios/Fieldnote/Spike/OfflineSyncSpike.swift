#if DEBUG
import FirebaseAuth
import FirebaseFirestore
import Foundation

/// Spike C: a Firestore write made offline survives an app kill and syncs when back online.
/// Step 1 (`write`): sign in, go offline, write a session doc, confirm it is in the local cache.
/// Kill the app. Step 2 (`verify`): relaunch, confirm the doc is still local, go online, wait
/// until the server has acknowledged it.
final class OfflineSyncSpike {
    static let pathKey = "FNOfflineSpikeDocPath"
    private let db = Firestore.firestore()

    func signIn() async throws -> String {
        if let uid = Auth.auth().currentUser?.uid { return uid }
        return try await Auth.auth().signInAnonymously().user.uid
    }

    /// Callback form on purpose: the async overload would wait for a server acknowledgement, which
    /// never comes while offline. The write lands in the local cache immediately.
    private static func queueWrite(_ ref: DocumentReference, uid: String) {
        ref.setData([
            "createdOffline": true,
            "createdBy": uid,
            "note": "P1 offline sanity write",
            "createdAt": Timestamp(date: Date()),
        ]) { _ in }
    }

    func writeOffline() async throws -> String {
        let uid = try await signIn()
        try await db.disableNetwork()
        let ref = db.collection("orgs/demo/jobs/spike-job/sessions").document()
        Self.queueWrite(ref, uid: uid)
        let cached = try await ref.getDocument(source: .cache)
        UserDefaults.standard.set(ref.path, forKey: Self.pathKey)
        return "uid=\(uid) wrote \(ref.path) while offline; in local cache: \(cached.exists), "
            + "pending: \(cached.metadata.hasPendingWrites)"
    }

    func verifyAndSync() async throws -> (detail: String, synced: Bool) {
        guard let path = UserDefaults.standard.string(forKey: Self.pathKey) else {
            return ("no pending spike write recorded; run the write step first", false)
        }
        let ref = db.document(path)
        let cached = try? await ref.getDocument(source: .cache)
        try await db.enableNetwork()
        try await db.waitForPendingWrites()
        let server = try await ref.getDocument(source: .server)
        let synced = server.exists && server.data()?["createdOffline"] as? Bool == true
        return ("after relaunch: in local cache \(cached?.exists == true) (pending \(cached?.metadata.hasPendingWrites == true)); "
                    + "after reconnect: on server \(server.exists)", synced)
    }
}
#endif
