import SwiftUI

struct JobDetailView: View {
    @Environment(AppModel.self) private var app
    let job: Job
    @Binding var path: [FlowRoute]

    @State private var packId: String?
    @State private var scanned: (brand: String?, model: String?, serial: String?)?
    @State private var showScan = false
    @State private var showPackPicker = false

    private var pack: FixPack? { packId.flatMap { app.packs.pack(id: $0) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(job.customerName).font(Theme.heading(.title)).foregroundStyle(Theme.textPrimary)
                    Label(job.address, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(Theme.textSecondary)
                    if !job.phone.isEmpty, let url = URL(string: "tel:\(job.phone.filter(\.isNumber))") {
                        Link(destination: url) { Label(job.phone, systemImage: "phone.fill") }
                            .font(.subheadline.weight(.semibold))
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: "Reported by customer")
                    Text(job.reported).font(.body).foregroundStyle(Theme.textPrimary)
                }
                .card()

                equipmentCard
            }
            .padding(Theme.gutter)
            .padding(.bottom, 140)
        }
        .screenBackground()
        .navigationTitle("Job")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) { actions }
        .sheet(isPresented: $showScan) {
            ScanView { result in
                scanned = (result.brand, result.model, result.serial)
                if let id = result.packId { packId = id }
            }
        }
        .confirmationDialog("Choose a fix pack", isPresented: $showPackPicker, titleVisibility: .visible) {
            ForEach(app.packs.packs, id: \.packId) { p in
                Button("\(p.brand) · \(p.family)") { packId = p.packId }
            }
        }
        .onAppear {
            if packId == nil { packId = app.packs.pack(forModel: job.model)?.packId }
        }
    }

    private var equipmentCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "Equipment")
            let brand = scanned?.brand ?? (job.brand.isEmpty ? nil : job.brand)
            let model = scanned?.model ?? (job.model.isEmpty ? nil : job.model)
            let serial = scanned?.serial ?? (job.serial.isEmpty ? nil : job.serial)
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                row("Brand", brand)
                row("Model", model)
                row("Serial", serial)
            }
            Divider().overlay(Theme.stroke)
            if let pack {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.brand).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(pack.brand) fix pack · v\(pack.version)").font(.headline).foregroundStyle(Theme.textPrimary)
                        Text("\(pack.family) · \(pack.faultCodes.count) fault codes · ready offline")
                            .font(.subheadline).foregroundStyle(Theme.textSecondary)
                    }
                }
            } else {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "questionmark.circle").foregroundStyle(Theme.caution).accessibilityHidden(true)
                    Text(model == nil ? "Scan the nameplate to find the right fix pack." : "No fix pack matches this model yet. Choose one manually if it's the same family.")
                        .font(.subheadline).foregroundStyle(Theme.textSecondary)
                }
            }
        }
        .card()
    }

    @ViewBuilder
    private func row(_ label: String, _ value: String?) -> some View {
        GridRow {
            Text(label).font(.subheadline).foregroundStyle(Theme.textSecondary)
            Text(value ?? "–").font(.body.weight(.semibold).monospaced()).foregroundStyle(Theme.textPrimary)
        }
    }

    private var actions: some View {
        VStack(spacing: 10) {
            if let pack {
                Button {
                    path.append(.faultCode(packId: pack.packId, job: job))
                } label: {
                    Label("Enter fault code", systemImage: "number")
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            HStack(spacing: 10) {
                Button { showScan = true } label: { Label("Scan nameplate", systemImage: "camera.viewfinder") }
                    .buttonStyle(SecondaryButtonStyle())
                if pack == nil {
                    Button { showPackPicker = true } label: { Label("Choose pack", systemImage: "list.bullet") }
                        .buttonStyle(SecondaryButtonStyle())
                }
            }
        }
        .padding(Theme.gutter)
        .background(.ultraThinMaterial)
    }
}
