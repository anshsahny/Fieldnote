import SwiftUI

/// Hidden diagnostics (long-press the logo on Today): AI availability, routing, ledger, packs.
struct DebugView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var evalRunning = false
    @State private var evalSummary: [String: String] = [:]

    private func runEval(_ route: InferenceRoute) {
        #if DEBUG
        evalRunning = true
        evalSummary = [:]
        Task {
            evalSummary = await NoteEval.run(name: "p3-notes", route: route)
            evalRunning = false
        }
        #endif
    }

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            List {
                Section("On-device model") {
                    LabeledContent("Availability", value: app.onDeviceAvailability)
                    LabeledContent("Network", value: app.network.isOnline ? "online" : "offline")
                }
                Section("Routing (Remote Config: \(app.config.origin.rawValue))") {
                    LabeledContent("route_diagnosis", value: app.config.route(for: .diagnosis).rawValue)
                    LabeledContent("route_nameplate", value: app.config.route(for: .nameplate).rawValue)
                    LabeledContent("cloud_model_fast", value: app.config.cloudModelFast)
                    LabeledContent("Confidence threshold", value: app.config.confidenceThreshold.formatted())
                    Picker("Override diagnosis route", selection: $app.routeOverride) {
                        Text("None (use Remote Config)").tag(InferenceRoute?.none)
                        ForEach(InferenceRoute.allCases) { Text($0.rawValue).tag(InferenceRoute?.some($0)) }
                    }
                }
                Section("Hybrid ledger (last 20, \(app.ledger.pending) waiting to sync)") {
                    if app.ledger.recent.isEmpty { Text("No inference yet").foregroundStyle(.secondary) }
                    ForEach(app.ledger.recent) { row in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(row.feature).font(.subheadline.weight(.semibold))
                                Text(row.at.formatted(date: .omitted, time: .standard)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(row.source) · \(row.latencyMs) ms\(row.ok ? "" : " · failed")").font(.caption.monospacedDigit())
                        }
                    }
                }
                Section("Fix packs") {
                    ForEach(app.packs.packs, id: \.packId) { p in
                        LabeledContent("\(p.brand) v\(p.version)", value: "\(p.faultCodes.count) codes · \(app.packs.origins[p.packId]?.rawValue ?? "?")")
                    }
                    if !app.packs.rejected.isEmpty {
                        Text("Rejected by validator: \(app.packs.rejected.joined(separator: ", "))").foregroundStyle(.red)
                    }
                }
                #if DEBUG
                Section("Note eval (10 notes, eval/scenarios/p3-notes.json)") {
                    Button(evalRunning ? "Running on this iPhone…" : "Run on-device (only_on_device)") { runEval(.onlyOnDevice) }
                        .disabled(evalRunning)
                    Button("Run in cloud (only_in_cloud)") { runEval(.onlyInCloud) }
                        .disabled(evalRunning || !app.network.isOnline)
                    if evalRunning { ProgressView().frame(maxWidth: .infinity) }
                    ForEach(evalSummary.keys.sorted(), id: \.self) { key in
                        LabeledContent(key, value: evalSummary[key] ?? "")
                    }
                }
                Section("Developer") {
                    NavigationLink("Setup status (App Check)") { ContentView() }
                    NavigationLink("Hybrid spikes") { SpikeView() }
                }
                #endif
            }
            .navigationTitle("Diagnostics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .preferredColorScheme(.dark)
    }
}
