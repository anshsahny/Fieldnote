import Foundation
import FirebaseRemoteConfig

/// Routing values are the Firebase AI Logic InferenceMode strings (shared with the web app).
nonisolated enum InferenceRoute: String, CaseIterable, Sendable, Identifiable {
    case preferOnDevice = "prefer_on_device"
    case onlyOnDevice = "only_on_device"
    case preferInCloud = "prefer_in_cloud"
    case onlyInCloud = "only_in_cloud"

    var id: String { rawValue }

    static func parse(_ raw: String?, fallback: InferenceRoute) -> InferenceRoute {
        let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        return InferenceRoute(rawValue: value) ?? fallback
    }
}

nonisolated enum AIFeature: String, CaseIterable, Sendable {
    case compile, triage, nameplate, diagnosis, report
    case jobSummary = "job_summary"
    case ledgerInsights = "ledger_insights"

    var routeKey: String { "route_\(rawValue)" }
}

nonisolated struct AIConfig: Sendable, Equatable {
    enum Origin: String, Sendable { case remote, defaults }

    var routes: [AIFeature: InferenceRoute]
    var cloudModelFast: String
    var cloudModelCompile: String
    var ondeviceMaxTokens: Int
    var confidenceThreshold: Double
    var origin: Origin

    func route(for feature: AIFeature) -> InferenceRoute { routes[feature] ?? .preferInCloud }
    func cloudModel(for feature: AIFeature) -> String { feature == .compile ? cloudModelCompile : cloudModelFast }

    /// Pure mapping from a key lookup (Remote Config) to validated config; blanks and junk fall
    /// back to the bundled template defaults.
    static func from(lookup: (String) -> String?, defaults: [String: String], origin: Origin) -> AIConfig {
        func str(_ key: String) -> String {
            if let v = lookup(key)?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty { return v }
            return defaults[key] ?? ""
        }
        func num(_ key: String) -> Double { Double(str(key)) ?? Double(defaults[key] ?? "") ?? 0 }
        var routes: [AIFeature: InferenceRoute] = [:]
        for feature in AIFeature.allCases {
            let fallback = InferenceRoute.parse(defaults[feature.routeKey], fallback: .preferInCloud)
            routes[feature] = InferenceRoute.parse(lookup(feature.routeKey), fallback: fallback)
        }
        return AIConfig(
            routes: routes,
            cloudModelFast: str("cloud_model_fast"),
            cloudModelCompile: str("cloud_model_compile"),
            ondeviceMaxTokens: Int(num("ondevice_max_tokens")),
            confidenceThreshold: num("diagnosis_confidence_threshold"),
            origin: origin)
    }
}

/// Reads remoteconfig.template.json (bundled at build time) into in-app defaults, so the app and
/// the deployed template can't drift.
nonisolated enum RemoteConfigTemplate {
    private struct Template: Decodable {
        struct Param: Decodable {
            struct Value: Decodable { let value: String? }
            let defaultValue: Value?
        }
        struct Group: Decodable { let parameters: [String: Param]? }
        let parameters: [String: Param]?
        let parameterGroups: [String: Group]?
    }

    static func defaults(fromJSON data: Data) throws -> [String: String] {
        let t = try JSONDecoder().decode(Template.self, from: data)
        var out: [String: String] = [:]
        let all = (t.parameters ?? [:]).merging(
            (t.parameterGroups ?? [:]).values.flatMap { ($0.parameters ?? [:]).map { ($0.key, $0.value) } },
            uniquingKeysWith: { a, _ in a })
        for (key, param) in all { if let v = param.defaultValue?.value { out[key] = v } }
        return out
    }

    static func bundledDefaults(bundle: Bundle = .main) -> [String: String] {
        guard let url = bundle.url(forResource: "remoteconfig.template", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let d = try? defaults(fromJSON: data)
        else { return [:] }
        return d
    }
}

/// Fetches Remote Config once per launch (with bundled defaults). Never throws.
final class AIConfigLoader {
    private(set) var current: AIConfig
    private let defaults: [String: String]

    init(bundle: Bundle = .main) {
        defaults = RemoteConfigTemplate.bundledDefaults(bundle: bundle)
        current = AIConfig.from(lookup: { _ in nil }, defaults: defaults, origin: .defaults)
    }

    func load() async -> AIConfig {
        let rc = RemoteConfig.remoteConfig()
        let settings = RemoteConfigSettings()
        #if DEBUG
        settings.minimumFetchInterval = 30
        #else
        settings.minimumFetchInterval = 600
        #endif
        rc.configSettings = settings
        rc.setDefaults(defaults.mapValues { $0 as NSString })
        var origin = AIConfig.Origin.defaults
        do {
            _ = try await rc.fetchAndActivate()
            origin = .remote
        } catch {
            // Offline or fetch throttled: keep the last activated values / bundled defaults.
        }
        current = AIConfig.from(lookup: { rc.configValue(forKey: $0).stringValue }, defaults: defaults, origin: origin)
        return current
    }
}
