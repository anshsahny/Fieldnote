import Foundation

/// Fix pack data contract (schemaVersion 1). Mirrors web/src/fixpack/schema.ts and
/// shared/fixpack.schema.json. Cross-reference rules live in FixPackValidator.
nonisolated struct FixPack: Codable, Sendable, Equatable {
    enum EquipmentType: String, Codable, Sendable { case gasFurnace = "gas_furnace", heatPump = "heat_pump", airConditioner = "air_conditioner", boiler }
    enum DisplayType: String, Codable, Sendable { case ledFlash = "led_flash", sevenSegment = "seven_segment", mixed }

    struct SourceRef: Codable, Sendable, Equatable {
        let id: String
        let title: String
        let url: String
        let pages: String
    }

    struct FaultCode: Codable, Sendable, Equatable {
        let code: String
        let display: String
        let meaning: String
        let likelyCauses: [String]
        let firstStep: String
        let sourceRef: String
        let pages: String
    }

    struct Ask: Codable, Sendable, Equatable {
        enum Kind: String, Codable, Sendable { case observation, yesno, reading }
        let type: Kind
        let options: [String]
        let unit: String?
    }

    struct Outcome: Codable, Sendable, Equatable {
        enum Kind: String, Codable, Sendable { case fix, escalate, resolved }
        let kind: Kind
        let summary: String
        let parts: [String]?
    }

    struct Step: Codable, Sendable, Equatable {
        let instruction: String
        let ask: Ask?
        let next: [String: String]?
        let outcome: Outcome?
        let safety: String?
        let pages: String?
    }

    struct SafetyStop: Codable, Sendable, Equatable {
        let id: String
        let triggers: [String]
        let message: String
    }

    let schemaVersion: Int
    let packId: String
    let brand: String
    let family: String
    let equipmentType: EquipmentType
    let displayType: DisplayType
    let modelPatterns: [String]
    let version: Int
    let sourceRefs: [SourceRef]
    let faultCodes: [FaultCode]
    let steps: [String: Step]
    let safetyStops: [SafetyStop]

    static let maxString = 200
    static let maxPackBytes = 25 * 1024
}

/// The six universal stops (shared/safety-stops.json, bundled at build time).
nonisolated enum UniversalSafetyStops {
    private struct File: Decodable { let safetyStops: [FixPack.SafetyStop] }

    static func load(bundle: Bundle = .main) -> [FixPack.SafetyStop] {
        guard let url = bundle.url(forResource: "safety-stops", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(File.self, from: data)
        else { return [] }
        return file.safetyStops
    }

    /// IDs the validator requires. Falls back to the known list if the resource is missing, so a
    /// broken bundle can never make the safety check weaker.
    static let requiredIDs: [String] = {
        let ids = load().map(\.id)
        return ids.isEmpty ? ["GAS", "CO", "BURNING", "WATER_ELECTRICAL", "EXPOSED_WIRING", "FLAME_ROLLOUT"] : ids
    }()
}
