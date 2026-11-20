import CoreGraphics
import Foundation
import Vision

/// On-device text recognition (Apple Vision, no network, no LLM).
nonisolated enum NameplateOCR {
    /// Returns recognized lines, top to bottom then left to right.
    static func recognizeLines(in image: CGImage) async throws -> [String] {
        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false // model/serial numbers aren't words
        let observations = try await request.perform(on: image)
        return observations
            .sorted {
                let a = $0.boundingBox.cgRect, b = $1.boundingBox.cgRect
                // Vision's origin is bottom-left: larger y = higher on the page.
                return abs(a.midY - b.midY) > 0.01 ? a.midY > b.midY : a.minX < b.minX
            }
            .compactMap { $0.topCandidates(1).first?.string }
    }
}
