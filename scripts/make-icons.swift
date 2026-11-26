// Draws Fieldnote's mark (a field-note page with a diagnostic trace) and writes every icon file.
// Run from the repo root:  swift scripts/make-icons.swift
//
//   ios/Fieldnote/Assets.xcassets/AppIcon.appiconset/AppIcon.png   1024 × 1024, opaque (iOS masks it)
//   web/public/apple-touch-icon.png                                180 × 180, opaque
//   web/public/icon-512.png                                        512 × 512, opaque
//
// The same coordinates (a 1024 grid) are used by web/public/favicon.svg, web/src/ui/BrandMark.tsx
// and ios/Fieldnote/UI/Components.swift (BrandMark), so the mark matches everywhere. Our own design:
// no SF Symbols or third-party glyphs (Apple's license excludes them from app icons and logos).
import AppKit
import ImageIO

enum Mark {
    static let top = NSColor(srgbRed: 0x15 / 255.0, green: 0x77 / 255.0, blue: 0x5F / 255.0, alpha: 1)    // #15775F
    static let bottom = NSColor(srgbRed: 0x0B / 255.0, green: 0x4A / 255.0, blue: 0x3C / 255.0, alpha: 1) // #0B4A3C
    static let page = NSColor(srgbRed: 0xF4 / 255.0, green: 0xFA / 255.0, blue: 0xF7 / 255.0, alpha: 1)   // #F4FAF7
    static let fold = NSColor(srgbRed: 0xBF / 255.0, green: 0xE3 / 255.0, blue: 0xD6 / 255.0, alpha: 1)   // #BFE3D6
    static let lines = NSColor(srgbRed: 0xA8 / 255.0, green: 0xD3 / 255.0, blue: 0xC4 / 255.0, alpha: 1)  // #A8D3C4
    static let trace = NSColor(srgbRed: 0x13 / 255.0, green: 0x80 / 255.0, blue: 0x5F / 255.0, alpha: 1)  // #13805F

    /// Page outline with the folded top-right corner (1024 grid).
    static func pagePath() -> CGPath {
        let p = CGMutablePath()
        let r: CGFloat = 56
        p.move(to: CGPoint(x: 262 + r, y: 212))
        p.addLine(to: CGPoint(x: 632, y: 212))
        p.addLine(to: CGPoint(x: 762, y: 342))
        p.addArc(tangent1End: CGPoint(x: 762, y: 812), tangent2End: CGPoint(x: 262, y: 812), radius: r)
        p.addArc(tangent1End: CGPoint(x: 262, y: 812), tangent2End: CGPoint(x: 262, y: 212), radius: r)
        p.addArc(tangent1End: CGPoint(x: 262, y: 212), tangent2End: CGPoint(x: 632, y: 212), radius: r)
        p.closeSubpath()
        return p
    }

    static let foldPoints = [CGPoint(x: 632, y: 212), CGPoint(x: 632, y: 342), CGPoint(x: 762, y: 342)]
    static let noteLines: [(CGPoint, CGPoint)] = [
        (CGPoint(x: 322, y: 332), CGPoint(x: 560, y: 332)),
        (CGPoint(x: 322, y: 412), CGPoint(x: 492, y: 412)),
    ]
    static let tracePoints = [
        CGPoint(x: 322, y: 602), CGPoint(x: 422, y: 602), CGPoint(x: 472, y: 492), CGPoint(x: 552, y: 722),
        CGPoint(x: 612, y: 552), CGPoint(x: 652, y: 602), CGPoint(x: 702, y: 602),
    ]

    static func draw(in ctx: CGContext, size: CGFloat) {
        ctx.saveGState()
        ctx.scaleBy(x: size / 1024, y: size / 1024)
        let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB),
                                  colors: [top.cgColor, bottom.cgColor] as CFArray, locations: [0, 1])!
        ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: 1024), options: [])

        ctx.addPath(pagePath())
        ctx.setFillColor(page.cgColor)
        ctx.fillPath()

        ctx.move(to: foldPoints[0])
        foldPoints.dropFirst().forEach { ctx.addLine(to: $0) }
        ctx.closePath()
        ctx.setFillColor(fold.cgColor)
        ctx.fillPath()

        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)
        ctx.setStrokeColor(lines.cgColor)
        ctx.setLineWidth(30)
        for (a, b) in noteLines {
            ctx.move(to: a)
            ctx.addLine(to: b)
        }
        ctx.strokePath()

        ctx.setStrokeColor(trace.cgColor)
        ctx.setLineWidth(44)
        ctx.addLines(between: tracePoints)
        ctx.strokePath()
        ctx.restoreGState()
    }
}

func writePNG(size: Int, to path: String) throws {
    // 32-bit RGB with the alpha byte skipped: PNGs come out opaque, as the App Store requires.
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.translateBy(x: 0, y: CGFloat(size)) // top-left origin, like the SVG
    ctx.scaleBy(x: 1, y: -1)
    Mark.draw(in: ctx, size: CGFloat(size))
    let url = URL(fileURLWithPath: path)
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(dest) else { throw CocoaError(.fileWriteUnknown) }
    print("wrote \(path) (\(size)×\(size))")
}

try writePNG(size: 1024, to: "ios/Fieldnote/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
try writePNG(size: 180, to: "web/public/apple-touch-icon.png")
try writePNG(size: 512, to: "web/public/icon-512.png")
