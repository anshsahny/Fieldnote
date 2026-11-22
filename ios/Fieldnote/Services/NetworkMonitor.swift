import FirebaseFirestore
import Foundation
import Network
import Observation

/// Online/offline for the UI (badges, "Offline · n queued") and for choosing the report route.
/// The diagnosis hybrid session falls back on its own when the network is gone.
@Observable
final class NetworkMonitor {
    private(set) var pathOnline = true
    /// Debug: behave as offline while the Mac (Simulator) is online. Also pauses Firestore's network.
    /// Persisted (Debug) so "kill the app while offline, reopen offline" can be tested on the Simulator.
    var simulateOffline = false {
        didSet {
            guard simulateOffline != oldValue else { return }
            UserDefaults.standard.set(simulateOffline, forKey: "FNSimulateOffline")
            applySimulation()
            notify()
        }
    }

    private func applySimulation() {
        if simulateOffline { Firestore.firestore().disableNetwork { _ in } } else { Firestore.firestore().enableNetwork { _ in } }
    }
    /// Called on every online/offline change.
    var onChange: ((Bool) -> Void)?

    var isOnline: Bool { pathOnline && !simulateOffline }

    private let monitor = NWPathMonitor()

    func start() {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "FNSimulateOffline") {
            simulateOffline = true
            applySimulation()
        }
        #endif
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in
                guard let self, self.pathOnline != online else { return }
                self.pathOnline = online
                self.notify()
            }
        }
        monitor.start(queue: DispatchQueue(label: "fieldnote.network"))
    }

    private func notify() { onChange?(isOnline) }
}
