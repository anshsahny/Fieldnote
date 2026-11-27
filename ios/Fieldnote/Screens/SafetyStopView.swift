import SwiftUI

/// Full-screen safety stop. Triggered by code (SafetyGuard) before any AI call; requires an
/// explicit acknowledgement; logged to the ledger.
struct SafetyStopView: View {
    let stop: FixPack.SafetyStop
    /// The tech's note that matched a trigger, when a note raised the stop.
    var note: String?
    let onContinue: () -> Void
    let onEndJob: () -> Void
    @State private var confirmed = false

    var body: some View {
        ZStack {
            Theme.dangerSurface.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 20) {
                Spacer(minLength: 20)
                Image(systemName: "exclamationmark.octagon.fill")
                    .font(.system(size: 72, weight: .bold))
                    .foregroundStyle(Theme.danger)
                    .accessibilityHidden(true)
                Text("STOP").font(.system(size: 52, weight: .black, design: .rounded)).foregroundStyle(.white)
                Text(SafetyCopy.headline(stop.id)).font(.title.weight(.bold)).foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
                Text(SafetyCopy.instructions(stop.message)).font(.title3).foregroundStyle(.white.opacity(0.95))
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 6) {
                    if let note {
                        Text("You wrote “\(note)”").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            .lineLimit(3)
                    }
                    Label("Raised by Fieldnote's safety rules in code, before any AI. The model can't skip it.",
                          systemImage: "lock.shield")
                        .font(.footnote).foregroundStyle(.white.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                Spacer()
                // Whole row is the target (gloves); a checkbox reads as a deliberate confirmation.
                Button { confirmed.toggle() } label: {
                    HStack(spacing: 14) {
                        Image(systemName: confirmed ? "checkmark.square.fill" : "square")
                            .font(.title2)
                            .foregroundStyle(confirmed ? .white : .white.opacity(0.7))
                        Text("The area is safe, or this was a false alarm")
                            .font(.headline).foregroundStyle(.white)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                    .padding(16)
                    .frame(minHeight: Theme.minTarget)
                    .background(.white.opacity(confirmed ? 0.16 : 0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(confirmed ? .isSelected : [])
                .accessibilityHint("Required before you can continue the diagnosis")
                Button("Continue diagnosis", action: onContinue)
                    .buttonStyle(PrimaryButtonStyle(tint: .white, foreground: Theme.dangerSurface))
                    .disabled(!confirmed)
                Button("End job and leave", action: onEndJob)
                    .buttonStyle(PrimaryButtonStyle(tint: Theme.danger, foreground: .white))
            }
            .padding(Theme.gutter)
        }
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled()
        .accessibilityElement(children: .contain)
    }
}
