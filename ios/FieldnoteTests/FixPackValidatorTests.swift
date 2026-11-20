import Foundation
import Testing
@testable import Fieldnote

private final class TestBundleToken {}

/// Runs the iOS validator over the same shared fixtures as web/src/fixpack/validate.test.ts.
nonisolated struct FixPackValidatorTests {
    struct Entry: Decodable, CustomTestStringConvertible, Sendable {
        let file: String
        let valid: Bool
        let errors: [String]
        var testDescription: String { file }
    }

    static let bundle = Bundle(for: TestBundleToken.self)

    static var manifest: [Entry] {
        guard let url = bundle.url(forResource: "manifest", withExtension: "json", subdirectory: "fixtures/fixpacks"),
              let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
    }

    @Test func manifestIsBundled() {
        #expect(Self.manifest.count >= 15)
    }

    @Test(arguments: manifest)
    func sharedFixture(entry: Entry) throws {
        let url = try #require(Self.bundle.resourceURL?.appendingPathComponent("fixtures/fixpacks/\(entry.file)"))
        let result = FixPackValidator.validate(json: try Data(contentsOf: url))
        if entry.valid {
            #expect(result.pack != nil, "\(result.issues)")
        } else {
            let codes = Set(result.issues.map(\.code.rawValue))
            #expect(codes == Set(entry.errors), "\(result.issues)")
        }
    }

    @Test func nextTargetPathMatchesTheWeb() throws {
        let url = try #require(Self.bundle.resourceURL?.appendingPathComponent("fixtures/fixpacks/invalid/next-target.json"))
        let first = FixPackValidator.validate(json: try Data(contentsOf: url)).issues.first
        #expect(first?.code == .nextTarget)
        #expect(first?.path == "steps.C3-1.next.runs")
    }

    @Test func universalSafetyStopsAreBundled() {
        #expect(UniversalSafetyStops.load().map(\.id) == ["GAS", "CO", "BURNING", "WATER_ELECTRICAL", "EXPOSED_WIRING", "FLAME_ROLLOUT"])
    }

    /// Every committed pack (bundled into the app from content/fixpacks/) must validate on iOS too.
    @Test func publishedPacksValidate() throws {
        let urls = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: "fixpacks") ?? []
        for url in urls {
            let result = FixPackValidator.validate(json: try Data(contentsOf: url))
            #expect(result.pack != nil, "\(url.lastPathComponent): \(result.issues.prefix(5))")
            #expect((result.pack?.faultCodes.count ?? 0) >= 6, "\(url.lastPathComponent) needs at least 6 fault codes")
        }
    }
}
