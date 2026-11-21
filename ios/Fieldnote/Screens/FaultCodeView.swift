import SwiftUI

/// Deterministic fault-code lookup in the pack (no AI): type it, tap it, or photograph the display.
struct FaultCodeView: View {
    @Environment(AppModel.self) private var app
    let packId: String
    let job: Job
    @Binding var path: [FlowRoute]

    @State private var input = ""
    @State private var showCamera = false
    @State private var scanNote: String?
    @FocusState private var focused: Bool

    private var pack: FixPack? { app.packs.pack(id: packId) }

    var body: some View {
        Group {
            if let pack {
                content(pack)
            } else {
                Text("This fix pack is no longer on the phone.").foregroundStyle(Theme.textSecondary)
            }
        }
        .screenBackground()
        .navigationTitle("Fault code")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in Task { await readDisplay(image.uprightCGImage(maxDimension: 2000)) } }.ignoresSafeArea()
        }
    }

    @ViewBuilder
    private func content(_ pack: FixPack) -> some View {
        let lookup = FaultCodeLookup.lookup(input, in: pack)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(pack.displayType == .ledFlash ? "What is the LED flashing?" : "What does the display show?")
                        .font(Theme.heading(.title)).foregroundStyle(Theme.textPrimary)
                    Text(pack.displayType == .ledFlash
                         ? "Count the short flashes, then the long flashes. 3 short + 1 long = 31."
                         : "Type the code exactly as shown, for example EE2.")
                        .font(.subheadline).foregroundStyle(Theme.textSecondary)
                }

                HStack(spacing: 10) {
                    TextField(pack.displayType == .ledFlash ? "31" : "EE2", text: $input)
                        .font(.system(size: 34, weight: .bold, design: .monospaced))
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .keyboardType(pack.displayType == .ledFlash ? .numberPad : .asciiCapable)
                        .focused($focused)
                        .padding(.horizontal, 16)
                        .frame(height: 72)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(focused ? Theme.brand : Theme.stroke, lineWidth: focused ? 2 : 1))
                        .accessibilityLabel("Fault code")
                    Button { showCamera = true } label: {
                        Image(systemName: "camera.viewfinder").font(.title2)
                            .frame(width: 72, height: 72)
                            .background(Theme.surfaceRaised, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                    .accessibilityLabel("Photograph the display")
                }
                if let scanNote { Text(scanNote).font(.footnote).foregroundStyle(Theme.textSecondary) }

                switch lookup {
                case .exact(let fc):
                    FaultCard(fault: fc, pack: pack)
                case .suggestions(let list):
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Did you mean").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textSecondary)
                        ForEach(list, id: \.code) { fc in
                            AnswerButton(title: "\(fc.code) · \(fc.meaning)") { input = fc.code }
                        }
                    }
                case .none:
                    if !input.isEmpty {
                        Label("That code isn't in the \(pack.brand) pack.", systemImage: "questionmark.circle")
                            .font(.subheadline).foregroundStyle(Theme.caution)
                    }
                }

                SectionLabel(text: "Codes in this pack")
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                    ForEach(pack.faultCodes, id: \.code) { fc in
                        Button { input = fc.code; focused = false } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(fc.code).font(.title3.weight(.bold).monospaced()).foregroundStyle(Theme.textPrimary)
                                Text(fc.meaning).font(.caption).foregroundStyle(Theme.textSecondary).lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                            .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
                            .padding(12)
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(FaultCodeLookup.normalize(input) == FaultCodeLookup.normalize(fc.code) ? Theme.brand : Theme.stroke))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(Theme.gutter)
            .padding(.bottom, 100)
        }
        .safeAreaInset(edge: .bottom) {
            if case .exact(let fc) = lookup {
                Button {
                    startDiagnosis(pack: pack, fault: fc)
                } label: { Label("Start diagnosis", systemImage: "stethoscope") }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(Theme.gutter)
                    .background(.ultraThinMaterial)
            }
        }
    }

    private func startDiagnosis(pack: FixPack, fault: FixPack.FaultCode) {
        app.jobs.setStatus("in_progress", for: job)
        path.append(.diagnose(DiagnosisRun(engine: app.makeEngine(pack: pack, fault: fault), job: job)))
    }

    /// Reads a photo of the control display and picks the first token that is a code in this pack.
    private func readDisplay(_ image: CGImage?) async {
        guard let image, let pack else { return }
        let lines = (try? await NameplateOCR.recognizeLines(in: image)) ?? []
        let tokens = lines.flatMap { $0.split(separator: " ").map(String.init) } + lines
        for token in tokens {
            if case .exact(let fc) = FaultCodeLookup.lookup(token, in: pack) {
                input = fc.code
                scanNote = "Read \"\(fc.code)\" from the photo. Check it matches the display."
                return
            }
        }
        scanNote = lines.isEmpty ? "No text found in the photo." : "Couldn't find a code from this pack in the photo. Type it instead."
    }
}

struct FaultCard: View {
    let fault: FixPack.FaultCode
    let pack: FixPack

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(fault.code).font(.system(size: 30, weight: .heavy, design: .monospaced)).foregroundStyle(Theme.brand)
                Text(fault.meaning).font(.headline).foregroundStyle(Theme.textPrimary)
            }
            if FaultCodeLookup.normalize(fault.display) != FaultCodeLookup.normalize(fault.code) {
                Text(fault.display).font(.subheadline).foregroundStyle(Theme.textSecondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: "Likely causes")
                ForEach(fault.likelyCauses, id: \.self) { cause in
                    Label(cause, systemImage: "smallcircle.filled.circle").font(.subheadline).foregroundStyle(Theme.textPrimary)
                        .labelStyle(.titleAndIcon)
                }
            }
            if let source = pack.sourceRefs.first(where: { $0.id == fault.sourceRef }) {
                Label("\(source.title.components(separatedBy: ":").first ?? source.title), p. \(fault.pages)", systemImage: "book.closed")
                    .font(.footnote).foregroundStyle(Theme.textSecondary)
            }
        }
        .card()
        .overlay(RoundedRectangle(cornerRadius: Theme.corner).stroke(Theme.brand.opacity(0.5)))
    }
}
