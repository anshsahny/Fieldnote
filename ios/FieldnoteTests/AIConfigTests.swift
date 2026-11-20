import Foundation
import Testing
@testable import Fieldnote

struct AIConfigTests {
    @Test func bundledTemplateDefinesAValidRouteForEveryFeature() {
        let defaults = RemoteConfigTemplate.bundledDefaults()
        #expect(!defaults.isEmpty, "remoteconfig.template.json should be bundled")
        for feature in AIFeature.allCases {
            let raw = defaults[feature.routeKey]
            #expect(InferenceRoute(rawValue: raw ?? "") != nil, "\(feature.routeKey) = \(raw ?? "nil")")
        }
        #expect(defaults["cloud_model_fast"]?.hasPrefix("gemini-") == true)
    }

    @Test func flattensTopLevelAndGroupedParameters() throws {
        let json = #"{"parameters":{"a":{"defaultValue":{"value":"1"}}},"parameterGroups":{"g":{"parameters":{"b":{"defaultValue":{"value":"x"}}}}}}"#
        #expect(try RemoteConfigTemplate.defaults(fromJSON: Data(json.utf8)) == ["a": "1", "b": "x"])
    }

    @Test(arguments: [
        ("prefer_on_device", InferenceRoute.preferOnDevice),
        (" ONLY_IN_CLOUD ", .onlyInCloud),
        ("on_device_please", .preferInCloud),
        ("", .preferInCloud),
    ])
    func routeParsingFallsBackOnJunk(raw: String, expected: InferenceRoute) {
        #expect(InferenceRoute.parse(raw, fallback: .preferInCloud) == expected)
    }

    @Test func remoteValuesWinAndBlanksFallBackToDefaults() {
        let defaults = ["route_diagnosis": "prefer_on_device", "route_report": "prefer_in_cloud",
                        "cloud_model_fast": "gemini-3.8-flash", "cloud_model_compile": "gemini-4-hydrogen",
                        "ondevice_max_tokens": "3000", "diagnosis_confidence_threshold": "0.6"]
        let remote = ["route_diagnosis": "only_in_cloud", "route_report": "nonsense", "cloud_model_fast": " ",
                      "ondevice_max_tokens": "lots"]
        let cfg = AIConfig.from(lookup: { remote[$0] }, defaults: defaults, origin: .remote)
        #expect(cfg.route(for: .diagnosis) == .onlyInCloud)
        #expect(cfg.route(for: .report) == .preferInCloud)
        #expect(cfg.cloudModel(for: .diagnosis) == "gemini-3.8-flash")
        #expect(cfg.cloudModel(for: .compile) == "gemini-4-hydrogen")
        #expect(cfg.ondeviceMaxTokens == 3000)
    }

    @Test func modelVersionMapsToInferenceSource() {
        #expect(InferenceSource(modelVersion: "apple-foundation-models-system-language-model") == .onDevice)
        #expect(InferenceSource(modelVersion: "gemini-3.8-flash") == .inCloud)
    }
}
