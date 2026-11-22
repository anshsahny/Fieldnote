import FirebaseFirestore
import Foundation
import Observation

/// Counts Firestore writes that the server hasn't acknowledged yet (sessions, reports, job status,
/// ledger rows), for the "Offline · n queued" badge and the "Synced ✓" confirmation.
///
/// Firestore keeps queued writes on disk, so they survive an app kill, but their completion
/// handlers don't. `earlierQueued` covers that case: at launch we ask Firestore to report when
/// every write queued before this launch has reached the server.
@Observable
final class SyncMonitor {
    private(set) var pending = 0
    private(set) var earlierQueued = false
    /// True for a few seconds after the queue drains following a period with queued writes.
    private(set) var justSynced = false
    private var hadQueue = false
    private var hideTask: Task<Void, Never>?

    var hasQueue: Bool { pending > 0 || earlierQueued }

    /// Call once Firestore is configured (after sign-in, when the cache belongs to this user).
    func start() {
        earlierQueued = true
        Firestore.firestore().waitForPendingWrites { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.earlierQueued = false
                self.drained()
            }
        }
        // waitForPendingWrites completes almost at once when nothing is queued; don't flash a badge.
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard let self, self.earlierQueued else { return }
            self.hadQueue = true
        }
    }

    /// Wraps one write. Pass the handler to the Firestore call; it runs when the server acknowledges.
    func track(_ write: (@escaping @Sendable (Error?) -> Void) -> Void) {
        pending += 1
        let started = Date()
        write { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.pending = max(0, self.pending - 1)
                // Only writes that actually waited (offline or slow network) earn a "Synced" note.
                if Date().timeIntervalSince(started) > 2 { self.hadQueue = true }
                self.drained()
            }
        }
    }

    private func drained() {
        guard !hasQueue, hadQueue else { return }
        hadQueue = false
        justSynced = true
        hideTask?.cancel()
        hideTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(3))
            self?.justSynced = false
        }
    }
}
