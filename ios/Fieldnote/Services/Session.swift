import FirebaseAuth
import FirebaseFirestore
import Foundation
import Observation

/// Firebase Auth (email/password) + the user's org profile (users/{uid}). Auth persists, so a signed-in
/// tech stays signed in offline; the profile is read through Firestore's offline cache.
@Observable
final class Session {
    struct Profile: Equatable, Sendable {
        let orgId: String
        let role: String
        let displayName: String?
    }

    enum State: Equatable {
        case loading
        case signedOut(error: String?)
        case signedIn(uid: String, email: String?, profile: Profile?)
    }

    private(set) var state: State = .loading
    private var handle: AuthStateDidChangeListenerHandle?

    var uid: String? { if case .signedIn(let uid, _, _) = state { uid } else { nil } }
    var profile: Profile? { if case .signedIn(_, _, let p) = state { p } else { nil } }

    func start() {
        guard handle == nil else { return }
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            let uid = user?.uid
            let email = user?.email
            Task { @MainActor in await self?.update(uid: uid, email: email) }
        }
    }

    private func update(uid: String?, email: String?) async {
        guard let uid else {
            if case .signedOut = state { return }
            state = .signedOut(error: nil)
            return
        }
        let snap = try? await Firestore.firestore().document("users/\(uid)").getDocument()
        let data = snap?.data()
        let profile = (data?["orgId"] as? String).map {
            Profile(orgId: $0, role: data?["role"] as? String ?? "tech", displayName: data?["displayName"] as? String)
        }
        state = .signedIn(uid: uid, email: email, profile: profile)
    }

    func signIn(email: String, password: String) async {
        do {
            _ = try await Auth.auth().signIn(withEmail: email, password: password)
        } catch {
            let code = AuthErrorCode(rawValue: (error as NSError).code)
            let message: String = switch code {
            case .wrongPassword, .invalidCredential, .userNotFound, .invalidEmail: "Email or password is incorrect."
            case .networkError: "No connection. Sign in once while online; after that Fieldnote works offline."
            default: "Sign-in failed. Try again."
            }
            state = .signedOut(error: message)
        }
    }

    func signOut() {
        try? Auth.auth().signOut()
    }

    #if DEBUG
    /// Debug builds only: the demo tech password from the gitignored Secrets.xcconfig.
    static var demoTechPassword: String? {
        let value = Bundle.main.object(forInfoDictionaryKey: "FNDemoTechPassword") as? String
        guard let value, !value.isEmpty, !value.hasPrefix("$(") else { return nil }
        return value
    }
    static let demoTechEmail = "tech@demo.fieldnote.test"
    #endif
}
