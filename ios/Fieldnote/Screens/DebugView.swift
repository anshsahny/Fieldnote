import SwiftUI

/// Hidden diagnostics (long-press the logo on Today): AI availability, routing, ledger, packs.
struct DebugView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var evalRunning = false
    @State private var evalResults: [(name: String, summary: [String: String])] = []
    #if DEBUG
    @State private var scenarioProgress: (done: Int, total: Int)?
    @State private var scenarioRuns: [(summary: String, route: String, file: URL?)] = []
    #endif
    private static let evalFiles = ["p3-notes", "p3-walkthrough"]
    private static let evalKeys = ["correct", "notes", "misses", "hedgedNotesClarified", "clarifyRate",
                                   "medianOnDeviceMs", "medianAllMs", "onDeviceTurns", "promptVersion", "threshold", "error"]

    private func runEval(_ route: InferenceRoute) {
        #if DEBUG
        evalRunning = true
        evalResults = []
        Task {
            for name in Self.evalFiles {
                evalResults.append((name, await NoteEval.run(name: name, route: route)))
            }
            evalRunning = false
        }
        #endif
    }

    #if DEBUG
    private func runScenarios(_ routes: [InferenceRoute]) {
        scenarioRuns = []
        scenarioProgress = (0, 0)
        Task {
            for route in routes {
                if let run = await ScenarioEval.run(route: route, progress: { scenarioProgress = ($0, $1) }) {
                    scenarioRuns.append((ScenarioEval.summary(run), route.rawValue, ScenarioEval.export(run)))
                }
            }
            scenarioProgress = nil
        }
    }
    #endif

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            List {
                Section("On-device model") {
                    LabeledContent("Availability", value: app.onDeviceAvailability)
                    LabeledContent("Network", value: app.network.isOnline ? "online" : "offline")
                }
                Section("Sync") {
                    LabeledContent("Writes waiting (this launch)", value: "\(app.sync.pending)")
                    LabeledContent("Writes from before launch", value: app.sync.earlierQueued ? "waiting" : "none")
                    LabeledContent("Reports", value: "\(app.reports.reports.count) (\(app.reports.drafts.count) drafts)")
                    #if DEBUG
                    Toggle("Simulate offline (Simulator)", isOn: Bindable(app.network).simulateOffline)
                    #endif
                }
                Section("Routing (Remote Config: \(app.config.origin.rawValue))") {
                    LabeledContent("route_diagnosis", value: app.config.route(for: .diagnosis).rawValue)
                    LabeledContent("route_nameplate", value: app.config.route(for: .nameplate).rawValue)
                    LabeledContent("route_report", value: app.config.route(for: .report).rawValue)
                    LabeledContent("auto_upgrade_reports", value: app.config.autoUpgradeReports ? "true" : "false")
                    LabeledContent("cloud_model_fast", value: app.config.cloudModelFast)
                    LabeledContent("Confidence threshold", value: app.config.confidenceThreshold.formatted())
                    Picker("Override diagnosis route", selection: $app.routeOverride) {
                        Text("None (use Remote Config)").tag(InferenceRoute?.none)
                        ForEach(InferenceRoute.allCases) { Text($0.rawValue).tag(InferenceRoute?.some($0)) }
                    }
                }
                Section("Hybrid ledger (last 20)") {
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
                Section("Note eval (eval/scenarios: p3-notes, p3-walkthrough)") {
                    Button(evalRunning ? "Running on this iPhone…" : "Run on-device (only_on_device)") { runEval(.onlyOnDevice) }
                        .disabled(evalRunning)
                    Button("Run in cloud (only_in_cloud)") { runEval(.onlyInCloud) }
                        .disabled(evalRunning || !app.network.isOnline)
                    if evalRunning { ProgressView().frame(maxWidth: .infinity) }
                }
                Section("P6 scenarios (24, eval/scenarios/p6-scenarios)") {
                    if let p = scenarioProgress {
                        ProgressView(value: Double(p.done), total: Double(max(p.total, 1))) {
                            Text("Running turn \(p.done) of \(p.total)…")
                        }
                    } else {
                        Button("Run on-device, then cloud") { runScenarios([.onlyOnDevice, .onlyInCloud]) }
                            .disabled(evalRunning || !app.network.isOnline)
                        Button("Run on-device only") { runScenarios([.onlyOnDevice]) }
                            .disabled(evalRunning)
                    }
                    ForEach(scenarioRuns, id: \.route) { run in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(run.route).font(.headline)
                            Text(run.summary).font(.footnote).foregroundStyle(.secondary)
                            if let file = run.file {
                                ShareLink(item: file) { Label("Share results (JSON)", systemImage: "square.and.arrow.up") }
                            }
                        }
                    }
                }
                ForEach(evalResults, id: \.name) { result in
                    Section("\(result.name) · \(result.summary["route"] ?? "")") {
                        ForEach(Self.evalKeys.filter { result.summary[$0] != nil }, id: \.self) { key in
                            LabeledContent(key, value: result.summary[key] ?? "")
                        }
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
