import CoreGraphics
import ImageIO
import PhotosUI
import SwiftUI

struct ScanResult {
    var brand: String?
    var model: String?
    var serial: String?
    var packId: String?
}

/// Nameplate scan: Apple Vision OCR on-device → regex against the packs' model patterns → (only if
/// ambiguous) the on-device model reads the lines → code checks its answer against the patterns.
struct ScanView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onUse: (ScanResult) -> Void

    enum Phase { case idle, reading, interpreting, done }

    @State private var phase: Phase = .idle
    @State private var lines: [String] = []
    @State private var ocrMs: Int?
    @State private var result = ScanResult()
    @State private var aiBadge: InferenceBadge.Kind?
    @State private var showCamera = false
    @State private var cameraDenied = false
    @State private var photo: PhotosPickerItem?
    @State private var manualModel = ""
    @State private var message: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Point at the rating plate. Text is read on this iPhone; nothing is uploaded.")
                        .font(.subheadline).foregroundStyle(Theme.textSecondary)

                    if phase == .idle {
                        captureButtons
                    } else {
                        resultCard
                    }

                    if phase == .done {
                        manualEntry
                    }
                }
                .padding(Theme.gutter)
            }
            .screenBackground()
            .navigationTitle("Scan nameplate")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                if phase == .done {
                    VStack(spacing: 10) {
                        Button {
                            onUse(result)
                            dismiss()
                        } label: { Label("Use this equipment", systemImage: "checkmark") }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(result.packId == nil && result.model == nil)
                        Button("Scan again") { reset() }.buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(Theme.gutter)
                    .background(.ultraThinMaterial)
                }
            }
            .cameraDeniedAlert(isPresented: $cameraDenied, alternative: "You can also choose a photo from your library.")
            .sheet(isPresented: $showCamera) {
                CameraPicker { image in Task { await read(image.uprightCGImage(maxDimension: 2400)) } }.ignoresSafeArea()
            }
            .onChange(of: photo) { _, item in
                Task {
                    guard let data = try? await item?.loadTransferable(type: Data.self), let image = UIImage(data: data) else { return }
                    await read(image.uprightCGImage(maxDimension: 2400))
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var captureButtons: some View {
        VStack(spacing: 12) {
            Button {
                Task { if await CameraAccess.requestIfNeeded() { showCamera = true } else { cameraDenied = true } }
            } label: { Label("Take a photo", systemImage: "camera.fill") }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
            PhotosPicker(selection: $photo, matching: .images) {
                Label("Choose a photo", systemImage: "photo.on.rectangle")
            }
            .buttonStyle(SecondaryButtonStyle())
            #if DEBUG
            Button("Use the sample nameplate (debug)") {
                Task { await read(SampleImages.nameplate()) }
            }
            .buttonStyle(SecondaryButtonStyle())
            #endif
        }
    }

    private var resultCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionLabel(text: "What we found")
                Spacer()
                if let ocrMs { InferenceBadge(kind: .vision(latencyMs: ocrMs)) }
            }
            switch phase {
            case .reading:
                ProgressView("Reading the plate on this iPhone…").tint(Theme.brand)
            case .interpreting:
                ProgressView("Asking the on-device model to sort it out…").tint(Theme.brand)
            default:
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                    GridRow { label("Brand"); value(result.brand) }
                    GridRow { label("Model"); value(result.model) }
                    GridRow { label("Serial"); value(result.serial) }
                }
                if let id = result.packId, let pack = app.packs.pack(id: id) {
                    Label("\(pack.brand) fix pack matched", systemImage: "checkmark.seal.fill")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.brand)
                } else if result.model != nil {
                    Label("No fix pack for this model yet", systemImage: "questionmark.circle")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.caution)
                }
                if let aiBadge {
                    HStack { Text("Model number confirmed by").font(.footnote).foregroundStyle(Theme.textSecondary); InferenceBadge(kind: aiBadge) }
                }
                if let message { Text(message).font(.footnote).foregroundStyle(Theme.textSecondary) }
            }
            if !lines.isEmpty {
                DisclosureGroup("Text read from the plate (\(lines.count) lines)") {
                    Text(lines.joined(separator: "\n")).font(.footnote.monospaced()).foregroundStyle(Theme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .font(.footnote.weight(.semibold))
            }
        }
        .card()
    }

    private var manualEntry: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Or type the model number")
            TextField("e.g. GMVC960803BN", text: $manualModel)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(.body.monospaced())
                .padding(.horizontal, 16)
                .frame(minHeight: Theme.minTarget)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.stroke))
                .onSubmit { applyManual() }
                .onChange(of: manualModel) { _, _ in applyManual() }
        }
    }

    private func label(_ s: String) -> some View { Text(s).font(.subheadline).foregroundStyle(Theme.textSecondary) }
    private func value(_ s: String?) -> some View {
        Text(s ?? "–").font(.body.weight(.semibold).monospaced()).foregroundStyle(Theme.textPrimary)
    }

    private func reset() {
        phase = .idle
        lines = []
        ocrMs = nil
        result = ScanResult()
        aiBadge = nil
        message = nil
    }

    private func applyManual() {
        let m = manualModel.uppercased().filter { !$0.isWhitespace }
        guard m.count >= 6 else { return }
        result.model = m
        result.packId = app.packs.pack(forModel: m)?.packId
        if let id = result.packId { result.brand = app.packs.pack(id: id)?.brand }
    }

    private func read(_ image: CGImage?) async {
        guard let image else { return }
        phase = .reading
        let start = ContinuousClock.now
        let found = (try? await NameplateOCR.recognizeLines(in: image)) ?? []
        let elapsed = (ContinuousClock.now - start).components
        ocrMs = Int(elapsed.seconds * 1000 + elapsed.attoseconds / 1_000_000_000_000_000)
        lines = found
        app.ledger.record(feature: "nameplate_ocr", source: "ON_DEVICE", latencyMs: ocrMs ?? 0, ok: !found.isEmpty,
                          tokenEstimate: nil, model: "apple-vision", mode: nil)

        let extracted = NameplateExtractor(packs: app.packs.packs).extract(lines: found)
        result = ScanResult(brand: extracted.brand, model: extracted.model, serial: extracted.serial, packId: extracted.packId)

        if !extracted.confident && !found.isEmpty {
            phase = .interpreting
            do {
                let ai = try await app.nameplateDisambiguator().resolve(lines: found)
                app.ledger.record(feature: "nameplate", source: ai.result.source.rawValue, latencyMs: ai.result.latencyMs,
                                  ok: true, tokenEstimate: nil, model: ai.result.modelVersion, mode: app.config.route(for: .nameplate))
                if let model = ai.model?.uppercased().filter({ !$0.isWhitespace }) {
                    // Code, not the model, decides whether this matches a pack.
                    let pack = app.packs.pack(forModel: model)
                    result.model = model
                    result.packId = pack?.packId
                    result.brand = result.brand ?? pack?.brand ?? ai.brand
                    result.serial = result.serial ?? ai.serial
                    aiBadge = InferenceBadge.Kind(ai.result.source, latencyMs: ai.result.latencyMs)
                }
            } catch {
                message = "Couldn't confirm the model number automatically. Type it below."
            }
        }
        if found.isEmpty { message = "No text found. Try again closer, with less glare, or type the model below." }
        phase = .done
    }
}

#if DEBUG
enum SampleImages {
    static func nameplate() -> CGImage? {
        guard let url = Bundle.main.url(forResource: "nameplate-gmvc96", withExtension: "png"),
              let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(src, 0, nil)
    }
}
#endif
