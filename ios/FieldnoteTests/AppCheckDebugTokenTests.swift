import Testing
@testable import Fieldnote

struct AppCheckDebugTokenTests {
    private static func info(simulator: String? = "sim-token", device: String? = "device-token") -> [String: Any] {
        var info: [String: Any] = [:]
        if let simulator { info[AppCheckDebugToken.simulatorInfoKey] = simulator }
        if let device { info[AppCheckDebugToken.deviceInfoKey] = device }
        return info
    }

    @Test func simulatorUsesSimulatorToken() {
        let token = AppCheckDebugToken.resolve(environment: [:], info: Self.info(), isSimulator: true)
        #expect(token == AppCheckDebugToken(value: "sim-token", source: .buildConfigSimulator))
    }

    @Test func deviceUsesDeviceToken() {
        let token = AppCheckDebugToken.resolve(environment: [:], info: Self.info(), isSimulator: false)
        #expect(token == AppCheckDebugToken(value: "device-token", source: .buildConfigDevice))
    }

    @Test func schemeEnvironmentVariableWins() {
        let env = [AppCheckDebugToken.environmentKey: "env-token"]
        let token = AppCheckDebugToken.resolve(environment: env, info: Self.info(), isSimulator: false)
        #expect(token == AppCheckDebugToken(value: "env-token", source: .environment))
    }

    @Test func legacyEnvironmentVariableIsHonoured() {
        let env = [AppCheckDebugToken.legacyEnvironmentKey: "legacy-token"]
        let token = AppCheckDebugToken.resolve(environment: env, info: Self.info(), isSimulator: true)
        #expect(token == AppCheckDebugToken(value: "legacy-token", source: .environment))
    }

    @Test func primaryEnvironmentVariableBeatsLegacyLikeTheSDK() {
        let env = [AppCheckDebugToken.environmentKey: "primary", AppCheckDebugToken.legacyEnvironmentKey: "legacy"]
        let token = AppCheckDebugToken.resolve(environment: env, info: [:], isSimulator: false)
        #expect(token.value == "primary")
    }

    @Test(arguments: ["", "   ", "$(FN_APPCHECK_DEBUG_TOKEN_DEVICE)"])
    func blankOrUnexpandedValuesAreIgnored(raw: String) {
        let token = AppCheckDebugToken.resolve(
            environment: [AppCheckDebugToken.environmentKey: raw, AppCheckDebugToken.legacyEnvironmentKey: raw],
            info: Self.info(device: raw),
            isSimulator: false
        )
        #expect(token == AppCheckDebugToken(value: nil, source: .none))
    }

    @Test func deviceNeverFallsBackToSimulatorToken() {
        let token = AppCheckDebugToken.resolve(environment: [:], info: Self.info(device: nil), isSimulator: false)
        #expect(token.value == nil)
    }
}
