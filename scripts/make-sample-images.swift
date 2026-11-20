// Generates the synthetic test images in content/samples/ (no third-party photos in the repo).
// Run from the repo root:  swift scripts/make-sample-images.swift
//
//  - nameplate-gmvc96.png        A furnace nameplate label, for Vision OCR tests (iOS) and for
//                                printing/photographing in the P1 "printed nameplate" check.
//  - customer-photo-led.jpg      A customer's photo of a furnace control board with a status LED
//                                and a diagnostic-code sticker, for web photo pre-triage.
//
// The model/serial values are fictional test data in a realistic format.
import AppKit

let outDir = URL(fileURLWithPath: "content/samples", isDirectory: true)
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

func render(width: Int, height: Int, draw: (CGRect) -> Void) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    // Flip so y grows downward, which makes layout code read top-to-bottom.
    let ctx = NSGraphicsContext.current!.cgContext
    ctx.translateBy(x: 0, y: CGFloat(height))
    ctx.scaleBy(x: 1, y: -1)
    draw(CGRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

func text(_ s: String, at p: CGPoint, size: CGFloat, weight: NSFont.Weight = .regular,
          color: NSColor = .black, mono: Bool = false) {
    let font = mono ? NSFont.monospacedSystemFont(ofSize: size, weight: weight)
                    : NSFont.systemFont(ofSize: size, weight: weight)
    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
    let str = NSAttributedString(string: s, attributes: attrs)
    // Undo the flip locally so glyphs aren't upside down.
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

// MARK: Nameplate

let nameplate = render(width: 1400, height: 900) { r in
    fill(r, NSColor(white: 0.62, alpha: 1))                                   // sheet metal
    let label = r.insetBy(dx: 70, dy: 60)
    fill(label, NSColor(calibratedRed: 0.93, green: 0.93, blue: 0.90, alpha: 1), radius: 14)
    stroke(label.insetBy(dx: 10, dy: 10), .black, width: 3, radius: 8)
    let x = label.minX + 50
    var y = label.minY + 40
    text("GOODMAN", at: CGPoint(x: x, y: y), size: 64, weight: .black); y += 86
    text("GAS-FIRED FORCED AIR FURNACE · CATEGORY IV", at: CGPoint(x: x, y: y), size: 30, weight: .semibold); y += 62
    let rows: [(String, String)] = [
        ("MODEL NO.", "GMVC960803BN"),
        ("SERIAL NO.", "1609123456"),
        ("MFG. DATE", "09/2016"),
        ("INPUT BTU/H", "80,000      OUTPUT BTU/H  77,000"),
        ("GAS", "NATURAL     MANIFOLD PRESS. 3.5 IN. W.C."),
        ("ELECTRICAL", "115 V  60 Hz  1 PH     MAX AMPS 9.0"),
    ]
    for (k, v) in rows {
        text(k, at: CGPoint(x: x, y: y), size: 32, weight: .bold)
        text(v, at: CGPoint(x: x + 290, y: y), size: 34, weight: .medium, mono: true)
        y += 60
    }
    y += 10
    text("FOR USE BY QUALIFIED SERVICE PERSONNEL ONLY", at: CGPoint(x: x, y: y), size: 24, weight: .semibold)
}
try nameplate.representation(using: .png, properties: [:])!
    .write(to: outDir.appendingPathComponent("nameplate-gmvc96.png"))

// MARK: Customer photo: control board + LED + code sticker

let photo = render(width: 1280, height: 960) { r in
    fill(r, NSColor(calibratedRed: 0.20, green: 0.21, blue: 0.22, alpha: 1))        // cabinet
    let board = CGRect(x: 90, y: 120, width: 560, height: 560)
    fill(board, NSColor(calibratedRed: 0.05, green: 0.38, blue: 0.20, alpha: 1), radius: 10)
    for i in 0..<6 {                                                               // terminals
        fill(CGRect(x: 130 + CGFloat(i) * 80, y: 600, width: 50, height: 50), NSColor(white: 0.85, alpha: 1), radius: 4)
    }
    text("R  W  Y  G  C  ", at: CGPoint(x: 140, y: 560), size: 26, weight: .bold, color: .white, mono: true)
    fill(CGRect(x: 170, y: 220, width: 220, height: 160), NSColor(white: 0.1, alpha: 1), radius: 6)   // relay
    // Status LED with glow
    let led = CGPoint(x: 520, y: 300)
    for (radius, alpha) in [(70.0, 0.10), (45.0, 0.25), (26.0, 0.6)] {
        fill(CGRect(x: led.x - radius, y: led.y - radius, width: radius * 2, height: radius * 2),
             NSColor(calibratedRed: 1, green: 0.1, blue: 0.05, alpha: alpha), radius: radius)
    }
    fill(CGRect(x: led.x - 14, y: led.y - 14, width: 28, height: 28), NSColor(calibratedRed: 1, green: 0.35, blue: 0.3, alpha: 1), radius: 14)
    text("STATUS", at: CGPoint(x: 470, y: 380), size: 26, weight: .bold, color: .white)

    // Diagnostic-code sticker on the door
    let sticker = CGRect(x: 720, y: 110, width: 480, height: 640)
    fill(sticker, NSColor(calibratedRed: 0.98, green: 0.97, blue: 0.90, alpha: 1), radius: 8)
    let sx = sticker.minX + 30
    var sy = sticker.minY + 30
    text("GOODMAN  GMVC96", at: CGPoint(x: sx, y: sy), size: 34, weight: .heavy); sy += 52
    text("DIAGNOSTIC CODES (RED LED)", at: CGPoint(x: sx, y: sy), size: 24, weight: .bold); sy += 50
    let codes = [
        ("1 FLASH", "Lockout, failed ignition"),
        ("2 FLASHES", "Pressure switch stuck closed"),
        ("3 FLASHES", "Pressure switch stuck open"),
        ("4 FLASHES", "Open high limit"),
        ("5 FLASHES", "Flame sensed, no call"),
        ("6 FLASHES", "Open rollout switch"),
        ("CONTINUOUS", "Normal operation"),
    ]
    for (k, v) in codes {
        text(k, at: CGPoint(x: sx, y: sy), size: 22, weight: .bold)
        text(v, at: CGPoint(x: sx + 150, y: sy), size: 22)
        sy += 44
    }
    sy += 20
    text("MODEL GMVC960803BN", at: CGPoint(x: sx, y: sy), size: 22, weight: .semibold, mono: true)
}
try photo.representation(using: .jpeg, properties: [.compressionFactor: 0.85])!
    .write(to: outDir.appendingPathComponent("customer-photo-led.jpg"))

print("wrote content/samples/nameplate-gmvc96.png and content/samples/customer-photo-led.jpg")
