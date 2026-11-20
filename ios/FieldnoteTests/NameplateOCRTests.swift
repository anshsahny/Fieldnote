import CoreGraphics
import Foundation
import ImageIO
import Testing
@testable import Fieldnote

struct NameplateOCRTests {
    /// Real Vision OCR on the bundled synthetic nameplate (content/samples/nameplate-gmvc96.png).
    @Test func readsBrandModelAndSerialFromSampleNameplate() async throws {
        let url = try #require(Bundle.main.url(forResource: "nameplate-gmvc96", withExtension: "png"))
        let source = try #require(CGImageSourceCreateWithURL(url as CFURL, nil))
        let image = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))

        let lines = try await NameplateOCR.recognizeLines(in: image)
        let text = lines.joined(separator: "\n").uppercased()
        #expect(text.contains("GOODMAN"))
        #expect(text.contains("GMVC960803BN"))
        #expect(text.contains("1609123456"))
        #expect(lines.first?.uppercased().contains("GOODMAN") == true, "lines should be top-to-bottom")
    }
}
