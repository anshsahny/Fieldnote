import Foundation

/// Where this run's App Check debug token comes from. Only the source is ever shown or
/// logged, never the token itself.
nonisolated enum AppCheckDebugTokenSource: String, Sendable {
    case environment = "Scheme env var"
    case buildConfigSimulator = "Secrets.xcconfig (simulator)"
    case buildConfigDevice = "Secrets.xcconfig (device)"
    case none = "None (SDK generated; see Xcode console)"
}

/// Picks the App Check debug token for Debug builds.
///
/// Precedence (mirrors AppCheckCore's `AppCheckCoreDebugProvider` in firebase-ios-sdk 13.x):
/// 1. An Xcode scheme env var: `AppCheckDebugToken`, else `FIRAAppCheckDebugToken`.
/// 2. The Info.plist key filled from the gitignored `Config/Secrets.xcconfig`:
///    the simulator token on the Simulator, the device token on a real iPhone.
///    This also works when the app is launched from the Home Screen (no Xcode attached),
///    which scheme env vars don't.
/// 3. Nothing: the SDK generates a token and prints it to the Xcode console for registration.
///
/// `FirebaseBootstrap` exports the chosen value as `AppCheckDebugToken` with `setenv` before
/// `FirebaseApp.configure()`, which is when the SDK reads its environment.
nonisolated struct AppCheckDebugToken: Equatable, Sendable {
    /// The env var the SDK reads first; this is the one we export.
    static let environmentKey = "AppCheckDebugToken"
    /// Legacy name the SDK still honours (second priority).
    static let legacyEnvironmentKey = "FIRAAppCheckDebugToken"
    static let simulatorInfoKey = "FNAppCheckDebugTokenSimulator"
    static let deviceInfoKey = "FNAppCheckDebugTokenDevice"

    let value: String?
    let source: AppCheckDebugTokenSource

    static func resolve(
        environment: [String: String],
        info: [String: Any],
        isSimulator: Bool
    ) -> AppCheckDebugToken {
        if let fromEnv = usable(environment[environmentKey]) ?? usable(environment[legacyEnvironmentKey]) {
            return AppCheckDebugToken(value: fromEnv, source: .environment)
        }
        let key = isSimulator ? simulatorInfoKey : deviceInfoKey
        if let fromConfig = usable(info[key] as? String) {
            return AppCheckDebugToken(
                value: fromConfig,
                source: isSimulator ? .buildConfigSimulator : .buildConfigDevice
            )
        }
        return AppCheckDebugToken(value: nil, source: .none)
    }

    /// Rejects empty values and unexpanded build-setting references like `$(FOO)`.
    private static func usable(_ raw: String?) -> String? {
        guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty,
              !trimmed.hasPrefix("$(")
        else { return nil }
        return trimmed
    }
}
