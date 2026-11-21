import FirebaseFirestore
import Foundation
import Observation

/// Hybrid Ledger rows (metadata only: never prompt or response text). Written to Firestore, which
/// queues them while offline; `pending` drives the "Offline · n queued" badge.
@Observable
final class Ledger {
    struct Row: Identifiable, Equatable {
        let id = UUID()
        let feature: String
        let source: String
        let latencyMs: Int
        let ok: Bool
        let at: Date
        let model: String?
    }

    var orgId: String?
    private(set) var recent: [Row] = []
    private(set) var pending = 0

    func record(feature: String, event: EngineEvent, mode: InferenceRoute?) {
        switch event {
        case let .inference(ok, source, latencyMs, tokenEstimate, model):
            record(feature: feature, source: source?.rawValue ?? "NONE", latencyMs: latencyMs, ok: ok,
                   tokenEstimate: tokenEstimate, model: model, mode: mode)
        case .safetyStop:
            record(feature: "safety_stop", source: "NONE", latencyMs: 0, ok: true, tokenEstimate: nil, model: nil, mode: nil)
        }
    }

    func record(feature: String, source: String, latencyMs: Int, ok: Bool, tokenEstimate: Int?, model: String?, mode: InferenceRoute?) {
        recent.insert(Row(feature: feature, source: source, latencyMs: latencyMs, ok: ok, at: Date(), model: model), at: 0)
        if recent.count > 20 { recent.removeLast(recent.count - 20) }
        guard let orgId else { return }
        var data: [String: Any] = [
            "feature": feature, "platform": "ios", "source": source,
            "latencyMs": max(0, latencyMs), "ok": ok, "ts": Timestamp(date: Date()),
        ]
        if let tokenEstimate { data["promptTokensEst"] = tokenEstimate }
        if let model { data["model"] = String(model.prefix(128)) }
        if let mode { data["mode"] = mode.rawValue }
        pending += 1
        Firestore.firestore().collection("orgs/\(orgId)/inferenceEvents").addDocument(data: data) { [weak self] _ in
            Task { @MainActor in self?.pending = max(0, (self?.pending ?? 1) - 1) }
        }
    }
}
