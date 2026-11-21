import SwiftUI

/// Field-first design tokens: dark by default (basements), high contrast, big targets (gloves).
enum Theme {
    // Surfaces
    static let background = Color(red: 0.055, green: 0.067, blue: 0.075)      // #0E1113
    static let surface = Color(red: 0.090, green: 0.106, blue: 0.118)         // #171B1E
    static let surfaceRaised = Color(red: 0.122, green: 0.141, blue: 0.157)   // #1F2428
    static let stroke = Color.white.opacity(0.10)

    // Text
    static let textPrimary = Color.white.opacity(0.95)
    static let textSecondary = Color(red: 0.69, green: 0.74, blue: 0.77)      // #B0BCC4, ≥ 7:1 on surface

    // Brand and status
    static let brand = Color(red: 0.31, green: 0.765, blue: 0.631)            // #4FC3A1
    static let onBrand = Color(red: 0.02, green: 0.14, blue: 0.11)            // dark text on teal
    static let onDevice = Color(red: 0.36, green: 0.85, blue: 0.53)           // green
    static let cloud = Color(red: 0.42, green: 0.69, blue: 1.0)               // blue
    static let plain = Color(red: 0.62, green: 0.66, blue: 0.69)              // gray
    static let caution = Color(red: 0.98, green: 0.74, blue: 0.27)            // amber
    static let danger = Color(red: 1.0, green: 0.38, blue: 0.34)              // red
    static let dangerSurface = Color(red: 0.36, green: 0.05, blue: 0.04)

    static let minTarget: CGFloat = 56
    static let corner: CGFloat = 18
    static let gutter: CGFloat = 16

    static func heading(_ style: Font.TextStyle = .title2) -> Font { .system(style, design: .rounded, weight: .bold) }
}

/// Primary call to action: full width, ≥ 56 pt, teal with dark text (AA contrast).
struct PrimaryButtonStyle: ButtonStyle {
    var tint: Color = Theme.brand
    var foreground: Color = Theme.onBrand
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: Theme.minTarget)
            .padding(.horizontal, 16)
            .foregroundStyle(foreground)
            .background(tint.opacity(isEnabled ? 1 : 0.35), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Secondary action on a raised surface.
struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: Theme.minTarget)
            .padding(.horizontal, 16)
            .foregroundStyle(Theme.textPrimary.opacity(isEnabled ? 1 : 0.4))
            .background(Theme.surfaceRaised, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.stroke))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

extension View {
    /// Standard card container.
    func card(padding: CGFloat = 16) -> some View {
        self.padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.corner, style: .continuous).stroke(Theme.stroke))
    }

    /// Screen background used everywhere.
    func screenBackground() -> some View {
        self.background(Theme.background.ignoresSafeArea())
    }
}
