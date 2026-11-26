#if DEBUG
import Foundation

/// Headless spike runs, driven by launch arguments (Debug builds only):
///   -FNRunSpikes all        every spike (OCR, nameplate, structured ×10, JSON fallback, tools)
///   -FNRunSpikes offline    the airplane-mode subset
///   -FNOfflineStep write    Firestore: sign in, write offline, then exit (simulates a kill)
///   -FNOfflineStep verify   Firestore: confirm the write survived, reconnect, wait for sync
///   -FNRunEval p3-notes     the note sample in eval/scenarios (see NoteEval; -FNEvalRoute picks the route)
///   -FNRunScenarios <route> the P6 scenarios (see ScenarioEval); -FNScenarioFile p7-filming picks another file
///   -FNExitWhenDone YES     exit after printing FNSPIKE_DONE (for scripted runs)
/// Results go to stdout as `FNSPIKE {json}` lines.
enum SpikeAutomation {
    static func runIfRequested() async {
        let defaults = UserDefaults.standard
        let spikes = defaults.string(forKey: "FNRunSpikes")
        let offlineStep = defaults.string(forKey: "FNOfflineStep")
        if let which = defaults.string(forKey: "FNRunScenarios") {
            let routes: [InferenceRoute] = which == "both"
                ? [.onlyOnDevice, .onlyInCloud]
                : [InferenceRoute(rawValue: which) ?? .onlyOnDevice]
            let file = defaults.string(forKey: "FNScenarioFile") ?? "p6-scenarios"
            for route in routes { _ = await ScenarioEval.run(route: route, file: file) }
            print("FNSPIKE_DONE")
            if defaults.bool(forKey: "FNExitWhenDone") {
                try? await Task.sleep(for: .milliseconds(500))
                exit(0)
            }
            return
        }
        if let evalName = defaults.string(forKey: "FNRunEval") {
            let route = InferenceRoute(rawValue: defaults.string(forKey: "FNEvalRoute") ?? "") ?? .preferOnDevice
            await NoteEval.run(name: evalName, route: route)
            print("FNSPIKE_DONE")
            if defaults.bool(forKey: "FNExitWhenDone") {
                try? await Task.sleep(for: .milliseconds(500))
                exit(0)
            }
            return
        }
        guard spikes != nil || offlineStep != nil else { return }

        let runner = SpikeRunner()
        switch (spikes, offlineStep) {
        case ("all", _): await runner.runAll()
        case ("offline", _): await runner.runOffline()
        case (_, "write"?):
            let spike = OfflineSyncSpike()
            do {
                SpikeRunner.log(["event": "offline-write", "detail": try await spike.writeOffline()])
                try? await Task.sleep(for: .seconds(2)) // let the local cache flush before the "kill"
            } catch {
                SpikeRunner.log(["event": "offline-write", "error": String(describing: error)])
            }
        case (_, "verify"?):
            do {
                let (detail, synced) = try await OfflineSyncSpike().verifyAndSync()
                SpikeRunner.log(["event": "offline-verify", "detail": detail, "synced": "\(synced)"])
            } catch {
                SpikeRunner.log(["event": "offline-verify", "error": String(describing: error)])
            }
        default: break
        }
        print("FNSPIKE_DONE")
        if defaults.bool(forKey: "FNExitWhenDone") || offlineStep == "write" {
            try? await Task.sleep(for: .milliseconds(500))
            exit(0)
        }
    }
}
#endif
