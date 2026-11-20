import SwiftUI

@main
struct FieldnoteApp: App {
    init() {
        if !FirebaseBootstrap.isRunningUnitTests {
            FirebaseBootstrap.configure()
        }
    }

    var body: some Scene {
        WindowGroup {
            if FirebaseBootstrap.isRunningUnitTests {
                Text("Running unit tests")
            } else {
                ContentView()
            }
        }
    }
}
