import SwiftUI

/// The customer report for a finished diagnosis. Cloud first when online; an on-device draft (or a
/// plain one from the fix pack) offline, upgraded with cloud AI when signal returns. Every version
/// says which model wrote it.
struct ReportView: View {
    @Environment(AppModel.self) private var app
    let run: DiagnosisRun
    @Binding var path: [FlowRoute]

    @State private var shownVersion: Int?

    private var report: ServiceReport? { app.reports.report(forSession: run.sessionId) }
    private var reportId: String { ServiceReport.id(forSession: run.sessionId) }
    private var isWriting: Bool { app.reportService.writing.contains(reportId) }
    private var isUpgrading: Bool { app.reportService.upgrading.contains(reportId) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let report, let index = selectedIndex(report) {
                    let version = report.versions[index]
                    versionBar(report, index: index)
                    upgradeBar(report)
                    reportContent(version.content, facts: report.facts)
                    Text(credit(version)).font(.caption).foregroundStyle(Theme.textSecondary)
                } else {
                    writingCard
                }
            }
            .padding(Theme.gutter)
            .padding(.bottom, 100)
        }
        .syncStatus()
        .screenBackground()
        .navigationTitle("Customer report")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) { bottomBar }
        .task {
            if report == nil, !isWriting { await app.writeReport(for: run) }
        }
        .onChange(of: report?.versions.count) { _, _ in shownVersion = nil }
    }

    // MARK: Header (printed by the app, never by the model)

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Service report").font(Theme.heading(.title)).foregroundStyle(Theme.textPrimary)
            Text(run.job.customerName).font(.headline).foregroundStyle(Theme.textPrimary)
            Text(run.job.address).font(.subheadline).foregroundStyle(Theme.textSecondary)
            HStack(spacing: 8) {
                Text(run.engine.fault.code)
                    .font(.subheadline.weight(.heavy).monospaced()).foregroundStyle(Theme.onBrand)
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(Theme.brand, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                Text("\(run.engine.pack.brand) \(run.job.model.isEmpty ? run.engine.pack.family : run.job.model)")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textSecondary)
                Spacer()
                Text(run.startedAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.subheadline).foregroundStyle(Theme.textSecondary)
            }
        }
    }

    private var writingCard: some View {
        HStack(spacing: 12) {
            ProgressView().tint(Theme.brand)
            Text(app.network.isOnline ? "Writing the report with cloud AI…" : "No signal. Drafting the report on this iPhone…")
                .font(.headline).foregroundStyle(Theme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    // MARK: Versions

    private func selectedIndex(_ r: ServiceReport) -> Int? {
        guard !r.versions.isEmpty else { return nil }
        return min(shownVersion ?? r.versions.count - 1, r.versions.count - 1)
    }

    private func label(_ v: ReportVersion) -> String {
        switch v.generatedBy {
        case InferenceSource.inCloud.rawValue: "Cloud"
        case InferenceSource.onDevice.rawValue: "On-device draft"
        default: "Plain draft"
        }
    }

    private func badge(_ v: ReportVersion) -> InferenceBadge.Kind {
        switch v.generatedBy {
        case InferenceSource.inCloud.rawValue: .cloud(latencyMs: v.latencyMs)
        case InferenceSource.onDevice.rawValue: .onDevice(latencyMs: v.latencyMs)
        default: .plain
        }
    }

    @ViewBuilder
    private func versionBar(_ r: ServiceReport, index: Int) -> some View {
        let v = r.versions[index]
        VStack(alignment: .leading, spacing: 10) {
            if r.versions.count > 1 {
                Picker("Version", selection: Binding(get: { index }, set: { shownVersion = $0 })) {
                    ForEach(Array(r.versions.enumerated()), id: \.offset) { i, version in
                        Text(label(version)).tag(i)
                    }
                }
                .pickerStyle(.segmented)
            }
            HStack(spacing: 8) {
                if v.kind == "draft" { Chip(text: "Draft", systemImage: "pencil", color: Theme.caution) }
                InferenceBadge(kind: badge(v))
                Spacer()
            }
        }
    }

    @ViewBuilder
    private func upgradeBar(_ r: ServiceReport) -> some View {
        if r.status == .draft {
            HStack(alignment: .top, spacing: 10) {
                if isUpgrading {
                    ProgressView().tint(Theme.cloud)
                    Text("Rewriting with cloud AI…").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textPrimary)
                } else if app.reportService.autoRetrying.contains(r.id) && app.network.isOnline {
                    ProgressView().tint(Theme.cloud)
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Connecting to cloud AI…").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textPrimary)
                        Button {
                            Task { await app.reportService.upgrade(r) }
                        } label: { Label("Try now", systemImage: "sparkles") }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                } else if app.network.isOnline {
                    Image(systemName: "cloud").foregroundStyle(Theme.cloud).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 14) {
                        Text(app.reportService.upgradeFailed.contains(r.id)
                             ? "Cloud AI couldn't rewrite it just now. The draft is saved."
                             : "Back online. The cloud model can write a fuller report.")
                            .font(.subheadline).foregroundStyle(Theme.textPrimary)
                        Button {
                            Task { await app.reportService.upgrade(r) }
                        } label: { Label("Upgrade with cloud AI", systemImage: "sparkles") }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                } else {
                    Image(systemName: "wifi.slash").foregroundStyle(Theme.caution).accessibilityHidden(true)
                    Text(app.config.autoUpgradeReports
                         ? "Saved on this iPhone. It goes to dispatch and is rewritten with cloud AI when you're back online."
                         : "Saved on this iPhone. It goes to dispatch when you're back online.")
                        .font(.subheadline).foregroundStyle(Theme.textPrimary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.surfaceRaised, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func credit(_ v: ReportVersion) -> String {
        let when = v.createdAt.formatted(date: .omitted, time: .shortened)
        switch v.generatedBy {
        case InferenceSource.inCloud.rawValue: return "Written in the cloud by \(v.model ?? "Gemini") at \(when)."
        case InferenceSource.onDevice.rawValue: return "Drafted on this iPhone by Apple's on-device model at \(when), with no signal needed."
        default: return "Assembled from the fix pack without AI at \(when)."
        }
    }

    // MARK: Body

    @ViewBuilder
    private func reportContent(_ c: ReportContent, facts: ReportFacts) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(c.summary).font(.body).foregroundStyle(Theme.textPrimary).fixedSize(horizontal: false, vertical: true)
            section("Work performed", c.workPerformed, symbol: "wrench.and.screwdriver")
            section("Findings", c.findings, symbol: "magnifyingglass")
            section("Recommendations", c.recommendations, symbol: "arrow.right.circle")
            section("Parts", facts.parts.map { $0.prefix(1).uppercased() + $0.dropFirst() }, symbol: "shippingbox")
            if !c.safetyNotes.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel(text: "Safety")
                    ForEach(c.safetyNotes, id: \.self) { note in
                        Label(note, systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline).foregroundStyle(Theme.textPrimary)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.caution.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .card()
    }

    @ViewBuilder
    private func section(_ title: String, _ items: [String], symbol: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: title)
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    Label(item.prefix(1).uppercased() + item.dropFirst(), systemImage: symbol)
                        .font(.subheadline).foregroundStyle(Theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    // MARK: Bottom bar

    private var bottomBar: some View {
        VStack(spacing: 8) {
            Button {
                app.jobs.setStatus("done", for: run.job)
                path.removeAll()
            } label: { Label("Finish job", systemImage: "checkmark.circle.fill") }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(report == nil)
        }
        .padding(Theme.gutter)
        .background(.ultraThinMaterial)
    }
}
