import Foundation
import Observation

/// Composition root for the technician app.
@Observable
final class AppModel {
    let session = Session()
    let packs = PackStore()
    let network = NetworkMonitor()
    let sync = SyncMonitor()
    let jobs: JobStore
    let ledger: Ledger
    let sessions: SessionStore
    let reports: ReportStore
    let ai = AIService()
    private(set) var reportService: ReportService!
    private let configLoader = AIConfigLoader()

    private(set) var config: AIConfig
    private(set) var onDeviceAvailability = AIService.onDeviceAvailability
    private var startedFor: String?

    /// Debug override for the diagnosis route (e.g. only_in_cloud to simulate no Apple Intelligence).
    var routeOverride: InferenceRoute? {
        didSet { UserDefaults.standard.set(routeOverride?.rawValue, forKey: "FNRouteOverride") }
    }

    var licenseAcknowledged: Bool {
        didSet { UserDefaults.standard.set(licenseAcknowledged, forKey: "FNLicenseAcknowledged") }
    }

    init() {
        jobs = JobStore(sync: sync)
        ledger = Ledger(sync: sync)
        sessions = SessionStore(sync: sync)
        reports = ReportStore(sync: sync)
        config = configLoader.current
        licenseAcknowledged = UserDefaults.standard.bool(forKey: "FNLicenseAcknowledged")
        routeOverride = UserDefaults.standard.string(forKey: "FNRouteOverride").flatMap(InferenceRoute.init(rawValue:))
        let ai = ai
        reportService = ReportService(
            writer: { [unowned self] in HybridReportWriter(ai: ai, cloudModel: self.config.cloudModel(for: .report)) },
            save: { [unowned self] in self.reports.save($0) },
            isOnline: { [unowned self] in self.network.isOnline },
            autoUpgradeEnabled: { [unowned self] in self.config.autoUpgradeReports },
            route: { [unowned self] in self.config.route(for: .report) })
        reportService.onEvent = { [unowned self] e in
            self.ledger.record(feature: "report", source: e.source?.rawValue ?? "NONE", latencyMs: e.latencyMs, ok: e.ok,
                               tokenEstimate: e.tokenEstimate, model: e.model, mode: e.route)
        }
        // Back in signal, or drafts loaded from the cache after a relaunch: upgrade drafts once.
        network.onChange = { [unowned self] online in if online { self.upgradeDrafts() } }
        reports.onChange = { [unowned self] in self.upgradeDrafts() }
    }

    private func upgradeDrafts() {
        guard network.isOnline, !reports.drafts.isEmpty else { return }
        let drafts = reports.drafts
        Task { await reportService.autoUpgrade(drafts) }
    }

    /// Writes (or rewrites) the customer report for a finished diagnosis.
    func writeReport(for run: DiagnosisRun) async {
        guard let uid = session.uid else { return }
        let facts = ReportFacts.from(engine: run.engine, equipmentModel: run.job.model, safetyTitles: SafetyCopy.headline)
        await reportService.generate(facts: facts, jobId: run.job.id, sessionId: run.sessionId, techUid: uid,
                                     existing: reports.report(forSession: run.sessionId))
    }

    var diagnosisRoute: InferenceRoute {
        // Simulated offline (Simulator): the Mac can still reach the cloud, so pin to on-device.
        if network.simulateOffline { return .onlyOnDevice }
        return routeOverride ?? config.route(for: .diagnosis)
    }
    var onDeviceReady: Bool { onDeviceAvailability == "available" }

    func start() async {
        session.start()
        network.start()
        config = await configLoader.load()
        onDeviceAvailability = AIService.onDeviceAvailability
    }

    /// Pull to refresh: re-fetch Remote Config (or keep the cached values offline) and retry
    /// report upgrades. Jobs, packs, sessions and reports are live listeners already.
    func refresh() async {
        config = await configLoader.load()
        onDeviceAvailability = AIService.onDeviceAvailability
        upgradeDrafts()
    }

    /// Called when the signed-in profile is known; idempotent per org/user.
    func connect(profile: Session.Profile, uid: String) {
        let key = "\(profile.orgId)|\(uid)"
        guard startedFor != key else { return }
        startedFor = key
        ledger.orgId = profile.orgId
        sync.start()
        sessions.configure(orgId: profile.orgId)
        jobs.onJobIds = { [weak self] ids in self?.sessions.follow(jobIds: ids) }
        packs.listen(orgId: profile.orgId)
        jobs.listen(orgId: profile.orgId, uid: uid)
        reports.listen(orgId: profile.orgId, uid: uid)
    }

    func makeEngine(pack: FixPack, fault: FixPack.FaultCode) -> DiagnosisEngine {
        let route = diagnosisRoute
        let engine = DiagnosisEngine(
            pack: pack, fault: fault,
            interpreter: HybridInterpreter(ai: ai, route: route, cloudModel: config.cloudModel(for: .diagnosis)),
            confidenceThreshold: config.confidenceThreshold)
        engine.onEvent = { [weak self] event in self?.ledger.record(feature: "diagnosis", event: event, mode: route) }
        return engine
    }

    /// Starts a diagnosis and saves its session (then again after every step).
    func startRun(pack: FixPack, fault: FixPack.FaultCode, job: Job) -> DiagnosisRun {
        let run = DiagnosisRun(engine: makeEngine(pack: pack, fault: fault), job: job, createdOffline: !network.isOnline)
        attach(run)
        return run
    }

    /// Rebuilds a saved session (e.g. after the app was killed mid-diagnosis). Nil if the pack is
    /// gone or no longer matches the saved answers.
    func resumeRun(_ state: SessionState, job: Job) -> DiagnosisRun? {
        guard let pack = packs.pack(id: state.packId),
              let fault = pack.faultCodes.first(where: { $0.code == state.faultCode }) else { return nil }
        let engine = makeEngine(pack: pack, fault: fault)
        guard engine.restore(state) else { return nil }
        let run = DiagnosisRun(engine: engine, job: job, sessionId: state.id, startedAt: state.startedAt,
                               createdOffline: state.createdOffline)
        attach(run, saveNow: false)
        return run
    }

    private func attach(_ run: DiagnosisRun, saveNow: Bool = true) {
        run.engine.onChange = { [weak self, weak run] in
            guard let self, let run else { return }
            self.saveSession(run)
        }
        if saveNow { saveSession(run) }
    }

    private func saveSession(_ run: DiagnosisRun) {
        guard let uid = session.uid else { return }
        let e = run.engine
        sessions.save(SessionState(
            id: run.sessionId, jobId: run.job.id, techUid: uid, packId: e.pack.packId, packVersion: e.pack.version,
            faultCode: e.fault.code, status: e.sessionStatus, stepId: e.stepId, history: e.sessionHistory,
            acknowledgedStops: e.acknowledgedStops, createdOffline: run.createdOffline,
            startedAt: run.startedAt, updatedAt: Date()))
    }

    func nameplateDisambiguator() -> NameplateDisambiguator {
        NameplateDisambiguator(ai: ai, route: routeOverride ?? config.route(for: .nameplate),
                               cloudModel: config.cloudModel(for: .nameplate))
    }
}
