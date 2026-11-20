import Foundation
import FirebaseCore
import FirebaseAppCheck

/// One place that starts Firebase. Order matters: the App Check provider factory must be set
/// before `FirebaseApp.configure()` (App Check is enforced for Firebase AI Logic).
enum FirebaseBootstrap {
    private(set) static var debugTokenSource: AppCheckDebugTokenSource = .none
    private static var isConfigured = false

    static var isSimulator: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }

    /// True when the app is only hosting unit tests; we skip network setup then.
    static var isRunningUnitTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    static func configure() {
        // A flag, not `FirebaseApp.app() == nil`: calling app() before configure() logs a
        // misleading "default app has not yet been configured" error.
        guard !isConfigured else { return }
        isConfigured = true

        #if DEBUG
        let token = AppCheckDebugToken.resolve(
            environment: ProcessInfo.processInfo.environment,
            info: Bundle.main.infoDictionary ?? [:],
            isSimulator: isSimulator
        )
        debugTokenSource = token.source
        if let value = token.value, token.source != .environment {
            // The debug provider reads the process environment when it is created during
            // FirebaseApp.configure(), so export the token first. Never logged.
            setenv(AppCheckDebugToken.environmentKey, value, 1)
        }
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        AppCheck.setAppCheckProviderFactory(AppAttestProviderFactory())
        #endif

        FirebaseApp.configure()
    }
}

#if !DEBUG
/// Production attestation (App Attest is registered in the Firebase console). Release builds
/// aren't distributed during the hackathon (no paid Apple program); this keeps Release honest.
final class AppAttestProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        AppAttestProvider(app: app)
    }
}
#endif
