import SwiftUI

/// Where the technician is in a job. Diagnosis runs are reference types (the engine is stateful).
enum FlowRoute: Hashable {
    case job(Job)
    case faultCode(packId: String, job: Job)
    case diagnose(DiagnosisRun)
}

final class DiagnosisRun: Hashable, Identifiable {
    let id = UUID()
    let engine: DiagnosisEngine
    let job: Job

    init(engine: DiagnosisEngine, job: Job) {
        self.engine = engine
        self.job = job
    }

    nonisolated static func == (a: DiagnosisRun, b: DiagnosisRun) -> Bool { a.id == b.id }
    nonisolated func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct RootView: View {
    @State private var app = AppModel()

    var body: some View {
        Group {
            if !app.licenseAcknowledged {
                OnboardingView()
            } else {
                switch app.session.state {
                case .loading:
                    ProgressView().tint(Theme.brand).frame(maxWidth: .infinity, maxHeight: .infinity).screenBackground()
                case .signedOut(let error):
                    SignInView(error: error)
                case .signedIn(let uid, _, let profile):
                    if let profile {
                        MainView()
                            .task(id: uid) { app.connect(profile: profile, uid: uid) }
                    } else {
                        NoProfileView()
                    }
                }
            }
        }
        .environment(app)
        .preferredColorScheme(.dark)
        .tint(Theme.brand)
        .task { await app.start() }
    }
}

struct MainView: View {
    @State private var path: [FlowRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            TodayView()
                .navigationDestination(for: FlowRoute.self) { route in
                    switch route {
                    case .job(let job): JobDetailView(job: job, path: $path)
                    case .faultCode(let packId, let job): FaultCodeView(packId: packId, job: job, path: $path)
                    case .diagnose(let run): DiagnoseView(run: run, path: $path)
                    }
                }
        }
    }
}

// MARK: - Onboarding

struct OnboardingView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    BrandMark(size: 64)
                    Text("Fieldnote").font(Theme.heading(.largeTitle)).foregroundStyle(Theme.textPrimary)
                    Text("Diagnose with zero bars.").font(.title3).foregroundStyle(Theme.textSecondary)
                }
                .padding(.top, 32)

                VStack(alignment: .leading, spacing: 16) {
                    feature("iphone", "AI that runs on this iPhone", "Notes are understood on-device, even in a basement with no signal.")
                    feature("book.closed", "Facts from manufacturer manuals", "Every step comes from a reviewed fix pack, with the manual page.")
                    feature("exclamationmark.octagon", "Safety stops in code", "Gas, CO, and electrical hazards stop the flow. The AI can't skip them.")
                }
                .card()

                AIStatusCard(availability: app.onDeviceAvailability)

                Text("Fieldnote is a diagnostic aid for licensed HVAC technicians. It does not replace the manufacturer's instructions, local codes, or your training.")
                    .font(.footnote)
                    .foregroundStyle(Theme.textSecondary)

                Button {
                    app.licenseAcknowledged = true
                } label: {
                    Label("I'm a licensed technician", systemImage: "checkmark.seal.fill")
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            .padding(Theme.gutter)
        }
        .screenBackground()
    }

    private func feature(_ symbol: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(Theme.brand)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline).foregroundStyle(Theme.textPrimary)
                Text(detail).font(.subheadline).foregroundStyle(Theme.textSecondary)
            }
        }
    }
}

struct AIStatusCard: View {
    let availability: String

    var body: some View {
        let ready = availability == "available"
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: ready ? "cpu.fill" : "icloud")
                .font(.title3)
                .foregroundStyle(ready ? Theme.onDevice : Theme.cloud)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(ready ? "Apple Intelligence is ready" : "Apple Intelligence isn't available")
                    .font(.headline).foregroundStyle(Theme.textPrimary)
                Text(ready
                     ? "Diagnosis runs on this iPhone, offline and at no cost."
                     : "Fieldnote will use cloud AI when online, and plain fix packs when offline. (\(availability))")
                    .font(.subheadline).foregroundStyle(Theme.textSecondary)
            }
        }
        .card()
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Sign in

struct SignInView: View {
    @Environment(AppModel.self) private var app
    let error: String?
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 12) {
                    BrandMark(size: 44)
                    Text("Sign in").font(Theme.heading(.largeTitle)).foregroundStyle(Theme.textPrimary)
                }
                .padding(.top, 40)
                Text("Sign in once while online. After that, your jobs and fix packs are available offline.")
                    .font(.subheadline).foregroundStyle(Theme.textSecondary)

                VStack(spacing: 12) {
                    field("Email", text: $email, secure: false)
                    field("Password", text: $password, secure: true)
                }

                if let error {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.danger)
                }

                Button {
                    submit(email.trimmingCharacters(in: .whitespaces), password)
                } label: {
                    if busy { ProgressView().tint(Theme.onBrand) } else { Text("Sign in") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(busy || email.isEmpty || password.isEmpty)

                #if DEBUG
                if let demo = Session.demoTechPassword {
                    Button("Sign in as demo tech (debug)") { submit(Session.demoTechEmail, demo) }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(busy)
                }
                #endif
            }
            .padding(Theme.gutter)
        }
        .screenBackground()
    }

    private func submit(_ email: String, _ password: String) {
        busy = true
        Task {
            await app.session.signIn(email: email, password: password)
            busy = false
        }
    }

    @ViewBuilder
    private func field(_ title: String, text: Binding<String>, secure: Bool) -> some View {
        Group {
            if secure {
                SecureField(title, text: text).textContentType(.password)
            } else {
                TextField(title, text: text)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        }
        .font(.body)
        .padding(.horizontal, 16)
        .frame(minHeight: Theme.minTarget)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.stroke))
    }
}

struct NoProfileView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.crop.circle.badge.questionmark").font(.system(size: 48)).foregroundStyle(Theme.textSecondary)
            Text("This account isn't set up for a team yet").font(.headline).foregroundStyle(Theme.textPrimary)
            Text("Ask your dispatcher to add you, then sign in again.").font(.subheadline).foregroundStyle(Theme.textSecondary)
            Button("Sign out") { app.session.signOut() }.buttonStyle(SecondaryButtonStyle())
        }
        .padding(Theme.gutter)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .screenBackground()
    }
}
