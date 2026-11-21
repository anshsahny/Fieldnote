import FirebaseFirestore
import Foundation
import Observation

/// Fix packs available on this phone: the packs bundled in the app (always offline) plus any newer
/// published versions synced from Firestore. Every synced pack is re-validated on device.
@Observable
final class PackStore {
    enum Origin: String { case bundled, synced }

    private(set) var packs: [FixPack]
    private(set) var origins: [String: Origin] = [:]
    private(set) var rejected: [String] = []
    private var listener: ListenerRegistration?

    init(bundled: [FixPack] = BundledPacks.load()) {
        packs = bundled
        for p in bundled { origins[p.packId] = .bundled }
    }

    func listen(orgId: String) {
        listener?.remove()
        listener = Firestore.firestore().collection("orgs/\(orgId)/fixpacks").addSnapshotListener { [weak self] snap, _ in
            guard let docs = snap?.documents else { return }
            let jsons = docs.compactMap { ($0.documentID, $0.data()["packJson"] as? String) }
            Task { @MainActor in self?.merge(jsons) }
        }
    }

    private func merge(_ docs: [(String, String?)]) {
        for (id, json) in docs {
            guard let json, let pack = FixPackValidator.validate(json: Data(json.utf8)).pack else {
                if !rejected.contains(id) { rejected.append(id) }
                continue
            }
            if let i = packs.firstIndex(where: { $0.packId == pack.packId }) {
                if pack.version > packs[i].version {
                    packs[i] = pack
                    origins[pack.packId] = .synced
                }
            } else {
                packs.append(pack)
                origins[pack.packId] = .synced
            }
        }
        packs.sort { $0.brand < $1.brand }
    }

    func pack(id: String) -> FixPack? { packs.first { $0.packId == id } }

    /// The pack whose model patterns fully match this model number.
    func pack(forModel model: String) -> FixPack? {
        let m = model.uppercased().filter { !$0.isWhitespace }
        return packs.first { pack in
            pack.modelPatterns.contains { pattern in
                guard let re = try? NSRegularExpression(pattern: pattern) else { return false }
                return NameplateExtractor.fullMatch(re, m)
            }
        }
    }

    func packs(forBrand brand: String) -> [FixPack] {
        packs.filter { $0.brand.caseInsensitiveCompare(brand) == .orderedSame }
    }
}
