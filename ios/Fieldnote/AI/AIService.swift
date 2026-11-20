import Foundation
import FirebaseAILogic
import FoundationModels

/// Where a response was generated, as reported by Firebase AI Logic (`rawResponse.modelVersion`).
nonisolated enum InferenceSource: String, Sendable {
    case onDevice = "ON_DEVICE"
    case inCloud = "IN_CLOUD"

    static let onDeviceModelVersion = "apple-foundation-models-system-language-model"

    init(modelVersion: String) {
        self = modelVersion == Self.onDeviceModelVersion ? .onDevice : .inCloud
    }
}

nonisolated struct AIResult<Content> {
    let content: Content
    let source: InferenceSource
    let modelVersion: String
    let latencyMs: Int
}

/// Firebase AI Logic hybrid inference (firebase-ios-sdk 12.19.x): Apple's on-device Foundation
/// Model and a cloud Gemini model behind one session, ordered by the Remote Config route.
final class AIService {
    private let ai: FirebaseAI

    init() {
        // Limited-use App Check tokens enable replay protection, which some models require.
        ai = FirebaseAI.firebaseAI(backend: .googleAI(), useLimitedUseAppCheckTokens: true)
    }

    /// Maps a route to the hybrid model order. Only-modes use a single model (no fallback).
    func model(for route: InferenceRoute, cloudModel: String) -> any LanguageModelProvider {
        let system = FirebaseAI.SystemLanguageModel.default
        let cloud = ai.geminiModel(name: cloudModel)
        switch route {
        case .onlyOnDevice: return system
        case .onlyInCloud: return cloud
        case .preferOnDevice: return HybridModelProvider.hybridModel(primary: system, secondary: cloud)
        case .preferInCloud: return HybridModelProvider.hybridModel(primary: cloud, secondary: system)
        }
    }

    /// A fresh session per request: sessions keep history, and our requests are single-turn.
    func session(route: InferenceRoute, cloudModel: String, instructions: String,
                 tools: [any FoundationModels.Tool] = []) -> GenerativeModelSession {
        let model = model(for: route, cloudModel: cloudModel)
        if tools.isEmpty {
            return ai.generativeModelSession(model: model, instructions: instructions)
        }
        return ai.generativeModelSession(model: model, tools: tools, instructions: instructions)
    }

    func respondText(_ prompt: String, instructions: String, route: InferenceRoute, cloudModel: String,
                     tools: [any FoundationModels.Tool] = []) async throws -> AIResult<String> {
        let session = session(route: route, cloudModel: cloudModel, instructions: instructions, tools: tools)
        let clock = ContinuousClock()
        let start = clock.now
        let response = try await session.respond(to: prompt)
        return AIResult(content: response.content,
                        source: InferenceSource(modelVersion: response.rawResponse.modelVersion),
                        modelVersion: response.rawResponse.modelVersion,
                        latencyMs: Self.ms(clock.now - start))
    }

    func respond<T: Generable>(_ prompt: String, generating type: T.Type, instructions: String,
                               route: InferenceRoute, cloudModel: String) async throws -> AIResult<T> {
        let session = session(route: route, cloudModel: cloudModel, instructions: instructions)
        let clock = ContinuousClock()
        let start = clock.now
        let response = try await session.respond(to: prompt, generating: type)
        return AIResult(content: response.content,
                        source: InferenceSource(modelVersion: response.rawResponse.modelVersion),
                        modelVersion: response.rawResponse.modelVersion,
                        latencyMs: Self.ms(clock.now - start))
    }

    /// Human-readable on-device availability (for the debug screen and logs).
    static var onDeviceAvailability: String {
        switch FirebaseAI.SystemLanguageModel.default.availability {
        case .available: return "available"
        case .unavailable(let reason): return "unavailable: \(reason)"
        }
    }

    private static func ms(_ d: Duration) -> Int {
        Int(d.components.seconds * 1000 + d.components.attoseconds / 1_000_000_000_000_000)
    }
}
