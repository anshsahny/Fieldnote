#if DEBUG
import PhotosUI
import SwiftUI
import UIKit

/// Debug screen for the P1 hybrid spikes (Debug builds only).
struct SpikeView: View {
    @State private var runner = SpikeRunner()
    @State private var route: InferenceRoute?
    @State private var showCamera = false
    @State private var photoItem: PhotosPickerItem?
    @State private var offlineStatus = "Not run"
    private let offline = OfflineSyncSpike()

    var body: some View {
        List {
            Section("On-device model") {
                LabeledContent("Availability", value: runner.availability)
                LabeledContent("Remote Config", value: "\(runner.config.origin.rawValue) · \(runner.config.cloudModelFast)")
                Picker("Route", selection: $route) {
                    Text("Remote Config (per feature)").tag(InferenceRoute?.none)
                    ForEach(InferenceRoute.allCases) { Text($0.rawValue).tag(InferenceRoute?.some($0)) }
                }
            }

            Section("Run") {
                Button("Run all") { Task { await runner.runAll() } }
                Button("Nameplate: OCR + model (sample)") {
                    Task { if let img = SpikeRunner.sampleNameplate() { await runner.runNameplate(image: img, label: "sample", route: route) } }
                }
                Button("Structured output ×10") { Task { await runner.runStructured(times: 10, route: route) } }
                Button("JSON fallback ×3") { Task { await runner.runJSONFallback(times: 3, route: route) } }
                Button("Tool calling") { Task { await runner.runTools(route: route ?? .onlyOnDevice) } }
                if let busy = runner.busy {
                    HStack { ProgressView(); Text(busy) }
                }
            }
            .disabled(runner.busy != nil)

            Section("Printed nameplate") {
                Button("Take a photo") { showCamera = true }
                    .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                PhotosPicker("Choose a photo", selection: $photoItem, matching: .images)
            }

            Section("Firestore offline sync") {
                Button("1. Write while offline") {
                    Task { offlineStatus = await capture { try await offline.writeOffline() } }
                }
                Button("2. Verify after relaunch, then sync") {
                    Task { offlineStatus = await capture { try await offline.verifyAndSync().detail } }
                }
                Text(offlineStatus).font(.footnote).foregroundStyle(.secondary)
            }

            Section("Results") {
                ForEach(runner.results) { r in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Image(systemName: r.pass ? "checkmark.circle.fill" : "xmark.octagon.fill")
                                .foregroundStyle(r.pass ? .green : .red)
                                .accessibilityLabel(r.pass ? "Passed" : "Failed")
                            Text(r.name).font(.headline)
                        }
                        Text("\(r.source) · \(r.route)\(r.latencyMs.map { " · \($0) ms" } ?? "")")
                            .font(.subheadline)
                        Text(r.detail).font(.footnote).foregroundStyle(.secondary).lineLimit(6)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .navigationTitle("Hybrid spikes")
        .task { await runner.loadConfig() }
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in Task { await runPhoto(image, label: "camera") } }
                .ignoresSafeArea()
        }
        .onChange(of: photoItem) { _, item in
            Task {
                guard let data = try? await item?.loadTransferable(type: Data.self),
                      let image = UIImage(data: data) else { return }
                await runPhoto(image, label: "photo")
            }
        }
    }

    private func runPhoto(_ image: UIImage, label: String) async {
        guard let cg = image.uprightCGImage(maxDimension: 2400) else { return }
        await runner.runNameplate(image: cg, label: label, route: route)
    }

    private func capture(_ work: () async throws -> String) async -> String {
        do {
            let detail = try await work()
            SpikeRunner.log(["event": "offline", "detail": detail])
            return detail
        } catch {
            SpikeRunner.log(["event": "offline", "error": String(describing: error)])
            return "Error: \(error.localizedDescription)"
        }
    }
}

#endif
