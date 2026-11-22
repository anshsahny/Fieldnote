import SwiftUI

/// The fix packs stored on this iPhone, with version and where each came from.
struct PacksSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(app.packs.packs, id: \.packId) { p in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.brand).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(p.brand) \(p.family) · v\(p.version)").font(.headline)
                                Text("\(p.faultCodes.count) fault codes · \(origin(p.packId))")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("Ready offline").font(.caption.weight(.semibold)).foregroundStyle(Theme.onDevice)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } footer: {
                    Text("Packs are checked by Fieldnote's validator before they're used. Newer versions published by dispatch download automatically when there's signal.")
                }
            }
            .navigationTitle("Fix packs on this iPhone")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .preferredColorScheme(.dark)
    }

    private func origin(_ packId: String) -> String {
        switch app.packs.origins[packId] {
        case .bundled: "built into the app"
        case .synced: "synced from dispatch"
        case nil: "on this iPhone"
        }
    }
}
