import Foundation
import Observation

/// Composition root for the technician app.
@Observable
final class AppModel {
    let session = Session()
    let packs = PackStore()
    let jobs = JobStore()
    let network = NetworkMonitor()
    let ledger = Ledger()
    let ai = AIService()
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
        config = configLoader.current
        licenseAcknowledged = UserDefaults.standard.bool(forKey: "FNLicenseAcknowledged")
        routeOverride = UserDefaults.standard.string(forKey: "FNRouteOverride").flatMap(InferenceRoute.init(rawValue:))
    }

    var diagnosisRoute: InferenceRoute { routeOverride ?? config.route(for: .diagnosis) }
    var onDeviceReady: Bool { onDeviceAvailability == "available" }

    func start() async {
        session.start()
        network.start()
        config = await configLoader.load()
        onDeviceAvailability = AIService.onDeviceAvailability
    }

    /// Called when the signed-in profile is known; idempotent per org/user.
    func connect(profile: Session.Profile, uid: String) {
        let key = "\(profile.orgId)|\(uid)"
        guard startedFor != key else { return }
        startedFor = key
        ledger.orgId = profile.orgId
        packs.listen(orgId: profile.orgId)
        jobs.listen(orgId: profile.orgId, uid: uid)
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

    func nameplateDisambiguator() -> NameplateDisambiguator {
        NameplateDisambiguator(ai: ai, route: routeOverride ?? config.route(for: .nameplate),
                               cloudModel: config.cloudModel(for: .nameplate))
    }
}
