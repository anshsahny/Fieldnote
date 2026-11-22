import SwiftUI

struct JobDetailView: View {
    @Environment(AppModel.self) private var app
    let job: Job
    @Binding var path: [FlowRoute]

    @State private var packId: String?
    @State private var scanned: (brand: String?, model: String?, serial: String?)?
    @State private var showScan = false
    @State private var showPackPicker = false
    @State private var resumeFailed = false

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

                sessionCard
                equipmentCard
            }
            .padding(Theme.gutter)
            .padding(.bottom, 140)
        }
        .syncStatus()
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
        .alert("Can't resume this diagnosis", isPresented: $resumeFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("The fix pack changed since it was saved. Start again from the fault code; your earlier answers are still in the job record.")
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

    private var savedSession: SessionState? { app.sessions.latest[job.id] }

    /// Opens the saved diagnosis. With a report, goes straight to it (Back shows the conclusion).
    private func open(_ state: SessionState, showReport: Bool = false) {
        guard let run = app.resumeRun(state, job: job) else {
            resumeFailed = true
            return
        }
        path.append(contentsOf: showReport ? [.diagnose(run), .report(run)] : [.diagnose(run)])
    }

    /// The whole card is the tap target (gloves): resume, open the conclusion, or open the report.
    @ViewBuilder
    private var sessionCard: some View {
        if let s = savedSession {
            let concluded = s.status == .concluded
            let report = concluded ? app.reports.report(forSession: s.id) : nil
            Button { open(s, showReport: report != nil) } label: {
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: concluded ? "checkmark.circle.fill" : "clock.arrow.circlepath")
                        .font(.title3).foregroundStyle(concluded ? Theme.onDevice : Theme.caution).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(concluded ? "Diagnosis complete · \(s.faultCode)" : "Diagnosis in progress · \(s.faultCode)")
                            .font(.headline).foregroundStyle(Theme.textPrimary)
                        Text(concluded
                             ? "\(s.history.count) steps · saved \(s.updatedAt.formatted(.relative(presentation: .named)))"
                             : "Step \(s.history.count + 1) · saved on this iPhone \(s.updatedAt.formatted(.relative(presentation: .named)))")
                            .font(.subheadline).foregroundStyle(Theme.textSecondary)
                        if let r = report {
                            Label(r.status == .final ? "Report written in the cloud"
                                  : r.generatedBy == "ON_DEVICE" ? "Report drafted on this iPhone" : "Plain report from the fix pack",
                                  systemImage: "doc.text")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(r.status == .final ? Theme.cloud : Theme.caution)
                        } else if concluded {
                            Label("No customer report yet", systemImage: "doc.badge.plus")
                                .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textSecondary)
                        }
                    }
                    .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textSecondary)
                        .accessibilityHidden(true)
                }
                .card()
                .contentShape(RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityHint(report != nil ? "Opens the customer report"
                               : concluded ? "Opens the diagnosis" : "Resumes the diagnosis")
        }
    }

    private var actions: some View {
        VStack(spacing: 10) {
            if let s = savedSession, s.status == .active {
                Button { open(s) } label: {
                    Label("Resume diagnosis · step \(s.history.count + 1)", systemImage: "play.fill")
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            if let pack {
                if savedSession?.status == .active {
                    Button {
                        path.append(.faultCode(packId: pack.packId, job: job))
                    } label: {
                        Label("Start over with a fault code", systemImage: "number")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                } else {
                    Button {
                        path.append(.faultCode(packId: pack.packId, job: job))
                    } label: {
                        Label("Enter fault code", systemImage: "number")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
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
