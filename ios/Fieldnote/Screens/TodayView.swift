import SwiftUI

struct TodayView: View {
    @Environment(AppModel.self) private var app
    @State private var showDebug = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                statusStrip
                if !app.network.isOnline { offlineBanner }

                if !app.jobs.loaded {
                    SectionLabel(text: "Jobs")
                    ProgressView().tint(Theme.brand).frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if app.jobs.jobs.isEmpty {
                    SectionLabel(text: "Jobs")
                    emptyState
                } else {
                    ForEach(JobGroup.make(app.jobs.jobs)) { group in
                        SectionLabel(text: group.title)
                        ForEach(group.jobs) { job in
                            NavigationLink(value: FlowRoute.job(job)) {
                                JobCard(job: job, pack: app.packs.pack(forModel: job.model))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(Theme.gutter)
        }
        .screenBackground()
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showDebug) { DebugView() }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            BrandMark(size: 40)
                .onLongPressGesture(minimumDuration: 0.8) { showDebug = true }
                .accessibilityLabel("Fieldnote")
                .accessibilityHint("Long press for diagnostics")
            VStack(alignment: .leading, spacing: 0) {
                Text("Today").font(Theme.heading(.largeTitle)).foregroundStyle(Theme.textPrimary)
                Text(Date.now.formatted(.dateTime.weekday(.wide).month().day()))
                    .font(.subheadline).foregroundStyle(Theme.textSecondary)
            }
            Spacer()
            Menu {
                if let name = app.session.profile?.displayName { Text(name) }
                Button("Sign out", role: .destructive) { app.session.signOut() }
            } label: {
                Image(systemName: "person.crop.circle")
                    .font(.title2)
                    .foregroundStyle(Theme.textSecondary)
                    .frame(width: Theme.minTarget, height: Theme.minTarget)
            }
            .accessibilityLabel("Account")
        }
    }

    private var statusStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if app.network.isOnline {
                    Chip(text: "Online", systemImage: "wifi", color: Theme.onDevice)
                } else {
                    InferenceBadge(kind: .offline(queued: app.ledger.pending))
                }
                if app.onDeviceReady && app.diagnosisRoute != .onlyInCloud {
                    Chip(text: "On-device AI ready", systemImage: "cpu", color: Theme.onDevice)
                } else if app.network.isOnline {
                    Chip(text: "Cloud AI", systemImage: "cloud", color: Theme.cloud)
                } else {
                    Chip(text: "Plain mode", systemImage: "list.bullet.rectangle", color: Theme.plain)
                }
                Chip(text: "\(app.packs.packs.count) packs offline", systemImage: "checkmark.circle.fill", color: Theme.brand)
            }
        }
    }

    private var offlineBanner: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "wifi.slash").foregroundStyle(Theme.caution).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("No signal").font(.headline).foregroundStyle(Theme.textPrimary)
                Text("Diagnosis keeps working on this iPhone. Notes and job updates sync when you're back online.")
                    .font(.subheadline).foregroundStyle(Theme.textSecondary)
            }
        }
        .card()
        .overlay(RoundedRectangle(cornerRadius: Theme.corner).stroke(Theme.caution.opacity(0.45)))
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "calendar.badge.checkmark").font(.system(size: 40)).foregroundStyle(Theme.textSecondary)
            Text("No jobs assigned to you").font(.headline).foregroundStyle(Theme.textPrimary)
            Text("New jobs from dispatch appear here and stay available offline.")
                .font(.subheadline).multilineTextAlignment(.center).foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }
}

/// Splits the technician's jobs into Today / Earlier (still open) / Upcoming.
struct JobGroup: Identifiable {
    let id: String
    let title: String
    let jobs: [Job]

    static func make(_ jobs: [Job], now: Date = .now, calendar: Calendar = .current) -> [JobGroup] {
        func isToday(_ j: Job) -> Bool { j.scheduledFor.map { calendar.isDate($0, inSameDayAs: now) } ?? true }
        let today = jobs.filter(isToday)
        let others = jobs.filter { !isToday($0) }
        let earlier = others.filter { ($0.scheduledFor ?? now) < now && $0.status != "done" }
        let upcoming = others.filter { ($0.scheduledFor ?? now) >= now }
        var groups: [JobGroup] = []
        if !earlier.isEmpty { groups.append(JobGroup(id: "earlier", title: "Earlier · still open", jobs: earlier)) }
        groups.append(JobGroup(id: "today", title: today.count == 1 ? "1 job today" : "\(today.count) jobs today", jobs: today))
        if !upcoming.isEmpty { groups.append(JobGroup(id: "upcoming", title: "Upcoming", jobs: upcoming)) }
        return groups
    }

    /// "9:30 AM" today, "Tomorrow 9:30 AM", otherwise "Tue 9:30 AM".
    static func when(_ date: Date, now: Date = .now, calendar: Calendar = .current) -> String {
        let time = date.formatted(date: .omitted, time: .shortened)
        if calendar.isDate(date, inSameDayAs: now) { return time }
        if let tomorrow = calendar.date(byAdding: .day, value: 1, to: now), calendar.isDate(date, inSameDayAs: tomorrow) {
            return "Tomorrow \(time)"
        }
        return "\(date.formatted(.dateTime.weekday(.abbreviated))) \(time)"
    }
}

struct JobCard: View {
    let job: Job
    let pack: FixPack?

    var body: some View {
        HStack(spacing: 0) {
            Rectangle().fill(priorityColor).frame(width: 5)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    if let time = job.scheduledFor {
                        Text(JobGroup.when(time))
                            .font(.subheadline.weight(.bold).monospacedDigit())
                            .foregroundStyle(Theme.textPrimary)
                    }
                    if job.priority == "urgent" { Chip(text: "Urgent", systemImage: "bolt.fill", color: Theme.danger) }
                    Spacer()
                    Chip(text: statusText, color: statusColor)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(job.customerName).font(.headline).foregroundStyle(Theme.textPrimary)
                    Text(job.address).font(.subheadline).foregroundStyle(Theme.textSecondary).lineLimit(1)
                }
                Text(job.reported).font(.subheadline).foregroundStyle(Theme.textPrimary.opacity(0.85)).lineLimit(2)
                HStack(spacing: 6) {
                    Image(systemName: "flame").imageScale(.small).accessibilityHidden(true)
                    Text(equipmentText).lineLimit(1)
                    if pack != nil {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.brand).accessibilityLabel("Fix pack ready")
                    }
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.textSecondary)
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.corner, style: .continuous).stroke(Theme.stroke))
        .accessibilityElement(children: .combine)
    }

    private var equipmentText: String {
        job.knownEquipment ? "\(job.brand) \(job.model)" : "Equipment unknown · scan the nameplate"
    }

    private var priorityColor: Color {
        switch job.priority {
        case "urgent": Theme.danger
        case "low": Theme.plain
        default: Theme.brand
        }
    }

    private var statusText: String {
        switch job.status {
        case "in_progress": "In progress"
        case "done": "Done"
        case "new": "New"
        default: "Scheduled"
        }
    }

    private var statusColor: Color {
        switch job.status {
        case "in_progress": Theme.caution
        case "done": Theme.onDevice
        default: Theme.textSecondary
        }
    }
}
