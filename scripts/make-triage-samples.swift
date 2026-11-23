// Generates the synthetic customer photos for web photo pre-triage (web/public/samples/).
// Run from the repo root:  swift scripts/make-triage-samples.swift
//
// Each image matches a published fix pack, so judges can see the code→pack match:
//   goodman-ee2.jpg     Goodman *MVC96 control board, 7-segment display showing EE2
//   carrier-led.jpg     Carrier 59SC5B control board with the red status LED (blink count is in the message)
//   rheem-45.jpg        Rheem R96V two-digit display showing 45
//   nameplate-only.jpg  Goodman nameplate, no code visible (the "ask the customer" path)
// All values are fictional test data in realistic formats; no third-party photos.
import AppKit

let outDir = URL(fileURLWithPath: "web/public/samples", isDirectory: true)
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

func render(width: Int, height: Int, draw: (CGRect) -> Void) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let ctx = NSGraphicsContext.current!.cgContext
    ctx.translateBy(x: 0, y: CGFloat(height))
    ctx.scaleBy(x: 1, y: -1)
    draw(CGRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

func text(_ s: String, at p: CGPoint, size: CGFloat, weight: NSFont.Weight = .regular, color: NSColor = .black, mono: Bool = false) {
    let font = mono ? NSFont.monospacedSystemFont(ofSize: size, weight: weight) : NSFont.systemFont(ofSize: size, weight: weight)
    let str = NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color])
    let ctx = NSGraphicsContext.current!.cgContext
    ctx.saveGState()
    ctx.translateBy(x: p.x, y: p.y + size)
    ctx.scaleBy(x: 1, y: -1)
    str.draw(at: .zero)
    ctx.restoreGState()
}

func fill(_ r: CGRect, _ c: NSColor, radius: CGFloat = 0) {
    c.setFill()
    NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius).fill()
}

func stroke(_ r: CGRect, _ c: NSColor, width: CGFloat, radius: CGFloat = 0) {
    c.setStroke()
    let p = NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius)
    p.lineWidth = width
    p.stroke()
}

/// Soft photo feel: vignette + slight sensor noise, so it isn't a flat vector render.
func photoFinish(_ r: CGRect) {
    let ctx = NSGraphicsContext.current!.cgContext
    let colors = [NSColor(white: 0, alpha: 0).cgColor, NSColor(white: 0, alpha: 0.45).cgColor] as CFArray
    let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0.55, 1])!
    ctx.drawRadialGradient(gradient, startCenter: CGPoint(x: r.midX, y: r.midY), startRadius: 0,
                           endCenter: CGPoint(x: r.midX, y: r.midY), endRadius: max(r.width, r.height) * 0.75, options: [])
    var rng = SystemRandomNumberGenerator()
    for _ in 0..<9000 {
        let x = CGFloat.random(in: 0..<r.width, using: &rng), y = CGFloat.random(in: 0..<r.height, using: &rng)
        fill(CGRect(x: x, y: y, width: 1.5, height: 1.5), NSColor(white: CGFloat.random(in: 0...1, using: &rng), alpha: 0.07))
    }
}

// MARK: Seven-segment glyphs

let segments: [Character: String] = [
    "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd",
    "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg", "E": "afged",
]

func sevenSegment(_ s: String, at origin: CGPoint, height h: CGFloat, on: NSColor, off: NSColor) {
    let w = h * 0.55, t = h * 0.11, gap = h * 0.22
    for (i, ch) in s.enumerated() {
        let x = origin.x + CGFloat(i) * (w + gap), y = origin.y
        let lit = Set(segments[ch] ?? "")
        let rects: [Character: CGRect] = [
            "a": CGRect(x: x + t, y: y, width: w - 2 * t, height: t),
            "b": CGRect(x: x + w - t, y: y + t, width: t, height: h / 2 - 1.5 * t),
            "c": CGRect(x: x + w - t, y: y + h / 2 + t / 2, width: t, height: h / 2 - 1.5 * t),
            "d": CGRect(x: x + t, y: y + h - t, width: w - 2 * t, height: t),
            "e": CGRect(x: x, y: y + h / 2 + t / 2, width: t, height: h / 2 - 1.5 * t),
            "f": CGRect(x: x, y: y + t, width: t, height: h / 2 - 1.5 * t),
            "g": CGRect(x: x + t, y: y + h / 2 - t / 2, width: w - 2 * t, height: t),
        ]
        for (seg, rect) in rects {
            if lit.contains(seg) {
                fill(rect.insetBy(dx: -4, dy: -4), on.withAlphaComponent(0.12), radius: t)   // glow
                fill(rect, on, radius: t / 2)
            } else {
                fill(rect, off, radius: t / 2)
            }
        }
    }
}

func board(_ rect: CGRect) {
    fill(rect, NSColor(calibratedRed: 0.05, green: 0.36, blue: 0.20, alpha: 1), radius: 12)
    for i in 0..<5 {
        fill(CGRect(x: rect.minX + 40 + CGFloat(i) * 78, y: rect.maxY - 90, width: 48, height: 48), NSColor(white: 0.85, alpha: 1), radius: 4)
    }
    text("R   W   Y   G   C", at: CGPoint(x: rect.minX + 48, y: rect.maxY - 132), size: 24, weight: .bold, color: .white, mono: true)
    fill(CGRect(x: rect.minX + 40, y: rect.minY + 40, width: 170, height: 120), NSColor(white: 0.1, alpha: 1), radius: 6)
}

func sticker(_ rect: CGRect, lines: [(String, CGFloat, NSFont.Weight, Bool)]) {
    fill(rect, NSColor(calibratedRed: 0.97, green: 0.96, blue: 0.90, alpha: 1), radius: 8)
    var y = rect.minY + 28
    for (s, size, weight, mono) in lines {
        text(s, at: CGPoint(x: rect.minX + 26, y: y), size: size, weight: weight, mono: mono)
        y += size * 1.6
    }
}

func save(_ rep: NSBitmapImageRep, _ name: String) throws {
    try rep.representation(using: .jpeg, properties: [.compressionFactor: 0.82])!.write(to: outDir.appendingPathComponent(name))
}

let cabinet = NSColor(calibratedRed: 0.19, green: 0.20, blue: 0.21, alpha: 1)
let red = NSColor(calibratedRed: 1, green: 0.18, blue: 0.12, alpha: 1)
// Unlit segments almost black: a faint red "8" behind every digit made Gemini Nano read EE2 as 888.
let offSeg = NSColor(calibratedRed: 0.075, green: 0.04, blue: 0.04, alpha: 1)

// 1. Goodman, EE2 on the board display
try save(render(width: 1280, height: 960) { r in
    fill(r, cabinet)
    let b = CGRect(x: 80, y: 150, width: 560, height: 600)
    board(b)
    fill(CGRect(x: 270, y: 230, width: 330, height: 190), NSColor(white: 0.04, alpha: 1), radius: 10)
    sevenSegment("EE2", at: CGPoint(x: 300, y: 260), height: 130, on: red, off: offSeg)
    text("STATUS", at: CGPoint(x: 380, y: 440), size: 24, weight: .bold, color: .white)
    sticker(CGRect(x: 730, y: 160, width: 470, height: 300), lines: [
        ("GOODMAN", 46, .black, false), ("GAS FURNACE · 96% AFUE", 24, .semibold, false),
        ("MODEL GMVC960803BN", 28, .semibold, true), ("SERIAL 1609123456", 26, .regular, true),
    ])
    photoFinish(r)
}, "goodman-ee2.jpg")

// 2. Carrier, red LED (the blink count is in the customer's message)
try save(render(width: 1280, height: 960) { r in
    fill(r, cabinet)
    let b = CGRect(x: 80, y: 150, width: 560, height: 600)
    board(b)
    let led = CGPoint(x: 470, y: 290)
    for (rad, a) in [(80.0, 0.10), (50.0, 0.25), (28.0, 0.6)] {
        fill(CGRect(x: led.x - rad, y: led.y - rad, width: rad * 2, height: rad * 2), red.withAlphaComponent(a), radius: rad)
    }
    fill(CGRect(x: led.x - 15, y: led.y - 15, width: 30, height: 30), NSColor(calibratedRed: 1, green: 0.45, blue: 0.4, alpha: 1), radius: 15)
    text("STATUS", at: CGPoint(x: 425, y: 390), size: 24, weight: .bold, color: .white)
    sticker(CGRect(x: 730, y: 160, width: 470, height: 330), lines: [
        ("CARRIER", 46, .black, false), ("GAS FURNACE", 24, .semibold, false),
        ("MODEL 59SC5B080E17--14", 26, .semibold, true), ("SEE DOOR LABEL FOR", 22, .regular, false),
        ("LED STATUS CODES", 22, .regular, false),
    ])
    photoFinish(r)
}, "carrier-led.jpg")

// 3. Rheem, two-digit display showing 45
try save(render(width: 1280, height: 960) { r in
    fill(r, cabinet)
    let b = CGRect(x: 80, y: 150, width: 560, height: 600)
    board(b)
    fill(CGRect(x: 300, y: 230, width: 270, height: 190), NSColor(white: 0.04, alpha: 1), radius: 10)
    sevenSegment("45", at: CGPoint(x: 340, y: 260), height: 130, on: red, off: offSeg)
    sticker(CGRect(x: 730, y: 160, width: 470, height: 300), lines: [
        ("RHEEM", 46, .black, false), ("CONDENSING GAS FURNACE", 24, .semibold, false),
        ("MODEL R96VA0702317MSA", 26, .semibold, true), ("TWO-STAGE · 96% AFUE", 22, .regular, false),
    ])
    photoFinish(r)
}, "rheem-45.jpg")

// 4. Nameplate only, no code visible
try save(render(width: 1280, height: 960) { r in
    fill(r, NSColor(white: 0.58, alpha: 1))
    let label = r.insetBy(dx: 90, dy: 120)
    fill(label, NSColor(calibratedRed: 0.93, green: 0.93, blue: 0.90, alpha: 1), radius: 14)
    stroke(label.insetBy(dx: 10, dy: 10), .black, width: 3, radius: 8)
    let x = label.minX + 46
    var y = label.minY + 40
    text("GOODMAN", at: CGPoint(x: x, y: y), size: 58, weight: .black); y += 80
    text("GAS-FIRED FORCED AIR FURNACE", at: CGPoint(x: x, y: y), size: 28, weight: .semibold); y += 60
    for (k, v) in [("MODEL NO.", "GMVC960803BN"), ("SERIAL NO.", "1609123456"), ("INPUT BTU/H", "80,000"), ("ELECTRICAL", "115 V 60 Hz 1 PH")] {
        text(k, at: CGPoint(x: x, y: y), size: 30, weight: .bold)
        text(v, at: CGPoint(x: x + 270, y: y), size: 32, weight: .medium, mono: true)
        y += 58
    }
    photoFinish(r)
}, "nameplate-only.jpg")

print("wrote web/public/samples/{goodman-ee2,carrier-led,rheem-45,nameplate-only}.jpg")
