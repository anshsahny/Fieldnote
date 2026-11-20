import SwiftUI
import FirebaseCore
import FirebaseAppCheck

/// Phase 0 placeholder: proves Firebase is configured and App Check can mint a token.
/// No AI calls yet (Phase 1).
struct ContentView: View {
    enum CheckState: Equatable {
        case checking
        case ok
        case failed(String)
    }

    @State private var appCheckState: CheckState = .checking

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Diagnose with zero bars.")
                            .font(.title2.bold())
                        Text("Phase 1 build. Firebase, App Check, and hybrid inference are wired; the technician flow arrives in Phase 3.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                Section("Setup status") {
                    LabeledContent("Firebase project", value: FirebaseApp.app()?.options.projectID ?? "Not configured")
                    LabeledContent("App Check") { appCheckLabel }
                    if case .failed(let message) = appCheckState {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    LabeledContent("Debug token", value: FirebaseBootstrap.debugTokenSource.rawValue)
                    LabeledContent("On-device model", value: AIService.onDeviceAvailability)
                }

                #if DEBUG
                Section("Debug") {
                    NavigationLink("Hybrid spikes") { SpikeView() }
                }
                #endif
            }
            .navigationTitle("Fieldnote")
            .task { await refreshAppCheck() }
            #if DEBUG
            .task { await SpikeAutomation.runIfRequested() }
            #endif
            .refreshable { await refreshAppCheck() }
        }
    }

    // Status text stays in the primary color for contrast; only the icon carries the color.
    // (A `Label` inside `LabeledContent` inflates the List row height on iOS 27, so HStack.)
    @ViewBuilder
    private var appCheckLabel: some View {
        switch appCheckState {
        case .checking:
            Text("Checking…")
        case .ok:
            status("Token acquired", symbol: "checkmark.seal.fill", tint: .green)
        case .failed:
            status("Not ready", symbol: "exclamationmark.triangle.fill", tint: .red)
        }
    }

    private func status(_ text: String, symbol: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(text)
                .foregroundStyle(.primary)
        }
    }

    private func refreshAppCheck() async {
        appCheckState = .checking
        do {
            let token = try await AppCheck.appCheck().token(forcingRefresh: false)
            appCheckState = token.token.isEmpty ? .failed("Empty token") : .ok
        } catch {
            appCheckState = .failed(error.localizedDescription)
        }
    }
}

#Preview {
    ContentView()
}
