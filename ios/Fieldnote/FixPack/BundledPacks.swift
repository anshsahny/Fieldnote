import Foundation

/// Packs shipped inside the app (content/fixpacks at build time): the offline baseline that works
/// before any sync. Only packs that pass the validator are returned.
nonisolated enum BundledPacks {
    static func load(bundle: Bundle = .main) -> [FixPack] {
        let urls = bundle.urls(forResourcesWithExtension: "json", subdirectory: "fixpacks") ?? []
        return urls.compactMap { url in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return FixPackValidator.validate(json: data).pack
        }
        .sorted { $0.brand < $1.brand }
    }
}
