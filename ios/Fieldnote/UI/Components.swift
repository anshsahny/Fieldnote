import SwiftUI

/// The plan's inference badges: where an answer came from, how long it took, what it cost.
struct InferenceBadge: View {
    enum Kind: Equatable {
        case onDevice(latencyMs: Int?)
        case cloud(latencyMs: Int?)
        case plain
        case offline(queued: Int)
        case vision(latencyMs: Int?)
    }

    let kind: Kind

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.caption.weight(.semibold))
            .labelStyle(.titleAndIcon)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: Capsule())
            .overlay(Capsule().stroke(color.opacity(0.35)))
            // Pulse when the route changes (on-device ↔ cloud), so a switch is visible on camera.
            .symbolEffect(.bounce, value: symbol)
            .animation(.snappy, value: symbol)
            .accessibilityElement(children: .combine)
    }

    private static func seconds(_ ms: Int?) -> String {
        guard let ms else { return "" }
        return " · " + (Double(ms) / 1000).formatted(.number.precision(.fractionLength(1))) + " s"
    }

    private var text: String {
        switch kind {
        case .onDevice(let ms): "On-device\(Self.seconds(ms)) · $0"
        case .cloud(let ms): "Cloud\(Self.seconds(ms))"
        case .plain: "Plain mode"
        case .offline(let q): q > 0 ? "Offline · \(q) queued" : "Offline"
        case .vision(let ms): "On-device · Vision\(Self.seconds(ms))"
        }
    }

    private var symbol: String {
        switch kind {
        case .onDevice, .vision: "iphone"
        case .cloud: "cloud"
        case .plain: "list.bullet.rectangle"
        case .offline: "wifi.slash"
        }
    }

    private var color: Color {
        switch kind {
        case .onDevice, .vision: Theme.onDevice
        case .cloud: Theme.cloud
        case .plain: Theme.plain
        case .offline: Theme.caution
        }
    }
}

extension InferenceBadge.Kind {
    init(_ source: InferenceSource, latencyMs: Int?) {
        self = source == .onDevice ? .onDevice(latencyMs: latencyMs) : .cloud(latencyMs: latencyMs)
    }
}

/// Small status pill.
struct Chip: View {
    let text: String
    var systemImage: String?
    var color: Color = Theme.textSecondary

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage { Image(systemName: systemImage).imageScale(.small) }
            Text(text)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .foregroundStyle(color)
        .background(color.opacity(0.13), in: Capsule())
    }
}

/// A step's pack-defined caution (shown before risky checks). Not a stop; the stop is full-screen.
struct CautionBanner: View {
    let stop: FixPack.SafetyStop

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Theme.caution)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Caution · \(SafetyCopy.title(stop.id))").font(.subheadline.weight(.bold)).foregroundStyle(Theme.caution)
                Text(SafetyCopy.watchFor(stop)).font(.footnote).foregroundStyle(Theme.textPrimary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.caution.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.caution.opacity(0.4)))
        .accessibilityElement(children: .combine)
    }
}

enum SafetyCopy {
    static func title(_ id: String) -> String {
        switch id {
        case "GAS": "Gas"
        case "CO": "Carbon monoxide"
        case "BURNING": "Overheating"
        case "WATER_ELECTRICAL": "Water near electrical"
        case "EXPOSED_WIRING": "Live electrical"
        case "FLAME_ROLLOUT": "Flame rollout"
        default: id.capitalized
        }
    }

    /// Step caution: what to watch for during a check that touches a hazard. The stop's own message
    /// ("Stop. ... shut off power") is for when the hazard is actually reported, so it isn't reused here.
    static func watchFor(_ stop: FixPack.SafetyStop) -> String {
        switch stop.id {
        case "GAS": "Gas is involved in this check. If you smell gas at any point, stop and leave the area."
        case "CO": "Watch for signs of carbon monoxide: a CO alarm, soot, or people feeling unwell. If you see any, stop."
        case "BURNING": "Watch for overheating or a burning smell. If you notice either, stop."
        case "WATER_ELECTRICAL": "Keep water away from live electrical parts. If they're wet, stop and shut off power."
        case "EXPOSED_WIRING": "Live voltage may be present. If you see exposed or damaged wiring, stop and lock out power."
        case "FLAME_ROLLOUT": "Watch for flames outside the burner area. If you see rollout, stop."
        default: stop.message
        }
    }

    /// Full-screen stop headline.
    static func headline(_ id: String) -> String {
        switch id {
        case "GAS": "Possible gas leak"
        case "CO": "Possible carbon monoxide"
        case "BURNING": "Overheating or burning"
        case "WATER_ELECTRICAL": "Water near live electrical"
        case "EXPOSED_WIRING": "Exposed live wiring"
        case "FLAME_ROLLOUT": "Flame rollout"
        default: title(id)
        }
    }

    /// The stop message under the STOP sign and headline: drops the leading "Stop." and a short
    /// restatement ("Possible gas leak."), which the screen already shows, so it opens with what to do.
    static func instructions(_ message: String) -> String {
        var text = message.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("Stop. ") { text = String(text.dropFirst(6)) }
        if let end = text.range(of: ". "),
           text[..<end.lowerBound].split(separator: " ").count <= 5 {
            text = String(text[end.upperBound...])
        }
        return text
    }
}

extension String {
    /// "gas supply ok" → "Gas supply ok": pack answers are lower-case keys; the UI shows them as labels.
    nonisolated var sentenceCased: String { prefix(1).uppercased() + dropFirst() }
}

/// A big tappable answer row (gloves).
struct AnswerButton: View {
    let title: String
    var highlighted = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title.sentenceCased)
                    .font(.body.weight(.semibold))
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.footnote.weight(.bold)).foregroundStyle(Theme.textSecondary)
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: Theme.minTarget)
            .foregroundStyle(Theme.textPrimary)
            .background(highlighted ? Theme.brand.opacity(0.18) : Theme.surfaceRaised,
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(highlighted ? Theme.brand : Theme.stroke, lineWidth: highlighted ? 2 : 1))
        }
        .buttonStyle(.plain)
    }
}

/// App mark used on onboarding and in the Today header.
/// Fieldnote's mark: a field-note page with a diagnostic trace. Same 1024 grid as the app icon
/// (scripts/make-icons.swift) and the web favicon, drawn in code so it stays sharp at any size.
struct BrandMark: View {
    var size: CGFloat = 36

    var body: some View {
        Canvas { ctx, canvas in
            let k = canvas.width / 1024
            func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * k, y: y * k) }
            let bg = Path(roundedRect: CGRect(origin: .zero, size: canvas), cornerRadius: canvas.width * 0.28, style: .continuous)
            ctx.fill(bg, with: .linearGradient(Gradient(colors: [Color(red: 0.082, green: 0.467, blue: 0.373),
                                                                 Color(red: 0.043, green: 0.290, blue: 0.235)]),
                                               startPoint: .zero, endPoint: CGPoint(x: 0, y: canvas.height)))
            var page = Path()
            page.move(to: pt(318, 212))
            page.addLine(to: pt(632, 212))
            page.addLine(to: pt(762, 342))
            page.addArc(tangent1End: pt(762, 812), tangent2End: pt(262, 812), radius: 56 * k)
            page.addArc(tangent1End: pt(262, 812), tangent2End: pt(262, 212), radius: 56 * k)
            page.addArc(tangent1End: pt(262, 212), tangent2End: pt(632, 212), radius: 56 * k)
            page.closeSubpath()
            ctx.fill(page, with: .color(Color(red: 0.957, green: 0.980, blue: 0.969)))
            ctx.fill(Path { $0.addLines([pt(632, 212), pt(632, 342), pt(762, 342)]) },
                     with: .color(Color(red: 0.749, green: 0.890, blue: 0.839)))
            let lines = Path { p in
                p.move(to: pt(322, 332)); p.addLine(to: pt(560, 332))
                p.move(to: pt(322, 412)); p.addLine(to: pt(492, 412))
            }
            ctx.stroke(lines, with: .color(Color(red: 0.659, green: 0.827, blue: 0.769)),
                       style: StrokeStyle(lineWidth: 30 * k, lineCap: .round))
            let trace = Path { $0.addLines([pt(322, 602), pt(422, 602), pt(472, 492), pt(552, 722), pt(612, 552), pt(652, 602), pt(702, 602)]) }
            ctx.stroke(trace, with: .color(Color(red: 0.075, green: 0.502, blue: 0.373)),
                       style: StrokeStyle(lineWidth: 44 * k, lineCap: .round, lineJoin: .round))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct SectionLabel: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold))
            .tracking(0.8)
            .foregroundStyle(Theme.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
