import Foundation
import Network
import Observation

/// Online/offline for the UI (badges, "Offline · n queued"). Not used for routing decisions: the
/// hybrid session falls back on its own when the network is gone.
@Observable
final class NetworkMonitor {
    private(set) var isOnline = true
    private let monitor = NWPathMonitor()

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in self?.isOnline = online }
        }
        monitor.start(queue: DispatchQueue(label: "fieldnote.network"))
    }
}
