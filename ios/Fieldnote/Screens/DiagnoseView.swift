import SwiftUI

struct DiagnoseView: View {
    @Environment(AppModel.self) private var app
    let run: DiagnosisRun
    @Binding var path: [FlowRoute]

    @State private var note = ""
    @State private var reading = ""
    @State private var readingRejected = false
    @State private var repairDone = false
    @FocusState private var noteFocused: Bool

    private var engine: DiagnosisEngine { run.engine }

    /// Whether the hybrid model will most likely answer on this iPhone (for the waiting label only;
    /// the badge on the result shows where it actually ran).
    private var expectsOnDevice: Bool {
        guard app.onDeviceReady else { return false }
        switch app.diagnosisRoute {
        case .preferOnDevice, .onlyOnDevice: return true
        case .preferInCloud: return !app.network.isOnline
        case .onlyInCloud: return false
        }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    faultHeader
                    if engine.phase == .concluded, let outcome = engine.outcome {
                        ConclusionCard(engine: engine, outcome: outcome, onUndo: undo,
                                       repairDone: Binding(get: { repairDone }, set: { repairDone = $0; run.repairDone = $0 }),
                                       askRepairDone: app.reports.report(forSession: run.sessionId) == nil)
                    } else {
                        stepCard
                            .id(engine.stepId)
                            .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 16)), removal: .opacity))
                    }
                    if !engine.history.isEmpty { historyTimeline }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(Theme.gutter)
                .animation(.snappy, value: engine.stepId)
                .animation(.snappy, value: engine.phase == .concluded)
            }
            .onChange(of: engine.stepId) { _, _ in withAnimation { proxy.scrollTo("top", anchor: .top) } }
            // A clarification lives in the step card: drop the keyboard and bring it into view, or it
            // sits off-screen and the note looks ignored.
            .onChange(of: isClarifying) { _, clarifying in
                guard clarifying else { return }
                noteFocused = false
                withAnimation { proxy.scrollTo("top", anchor: .top) }
            }
        }
        .sensoryFeedback(.selection, trigger: isClarifying)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: undo) { Label("Undo last answer", systemImage: "arrow.uturn.backward") }
                    .disabled(!engine.canUndo)
            }
        }
        .syncStatus()
        .screenBackground()
        .navigationTitle(engine.phase == .concluded ? "Conclusion" : "Step \(engine.stepNumber)")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) { bottomBar }
        .sensoryFeedback(.impact(weight: .medium), trigger: engine.stepId)
        .sensoryFeedback(.warning, trigger: isSafetyStop)
        .sensoryFeedback(.success, trigger: engine.phase == .concluded) { _, concluded in concluded }
        .fullScreenCover(isPresented: Binding(get: { isSafetyStop }, set: { _ in })) {
            if case .safetyStop(let stop) = engine.phase {
                SafetyStopView(stop: stop) {
                    engine.acknowledgeSafety()
                } onEndJob: {
                    engine.acknowledgeSafety()
                    path.removeAll()
                }
            }
        }
    }

    private var isSafetyStop: Bool {
        if case .safetyStop = engine.phase { return true }
        return false
    }

    private var isClarifying: Bool {
        if case .clarifying = engine.phase { return true }
        return false
    }

    /// Step back one answer; a misread note goes back in the field so the tech can tap or rephrase.
    private func undo() {
        guard let entry = engine.undoLast() else { return }
        if case .note(let text) = entry.via { note = text }
    }

    // MARK: Header

    private var faultHeader: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(engine.fault.code)
                .font(.title3.weight(.heavy).monospaced())
                .foregroundStyle(Theme.onBrand)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Theme.brand, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 0) {
                Text(engine.fault.meaning).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.textPrimary).lineLimit(2)
                Text("\(engine.pack.brand) · \(run.job.customerName)").font(.caption).foregroundStyle(Theme.textSecondary)
            }
            Spacer()
            TimelineView(.periodic(from: engine.startedAt, by: 30)) { context in
                Label(elapsed(until: context.date), systemImage: "clock")
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .id("top")
    }

    // MARK: Step

    private var stepCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let last = engine.history.last, let i = last.interpretation, case .note = last.via {
                aiTurn(say: i.decision.say, answer: last.answer, interpretation: i)
            }
            if let caution = engine.cautionStop { CautionBanner(stop: caution) }

            Text(engine.step.instruction)
                .font(Theme.heading(.title2))
                .foregroundStyle(Theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let pages = engine.step.pages ?? Optional(engine.fault.pages) {
                Label("Manual p. \(pages)", systemImage: "book.closed").font(.caption).foregroundStyle(Theme.textSecondary)
            }

            clarification

            if let ranges = engine.readingRanges { readingInput(ranges) }

            VStack(spacing: 10) {
                ForEach(engine.allowedAnswers, id: \.self) { option in
                    AnswerButton(title: option, highlighted: suggested == option) { engine.tap(option); note = "" }
                        .disabled(engine.phase == .interpreting)
                }
            }
        }
        .card()
        .animation(.snappy, value: engine.stepId)
    }

    private var suggested: String? {
        if case .clarifying(.lowConfidence(let choice, _, _)) = engine.phase { return choice }
        if case .clarifying(.hedged(let choice, _)) = engine.phase { return choice }
        return nil
    }

    @ViewBuilder
    private var clarification: some View {
        switch engine.phase {
        case .clarifying(.unclear(let say)):
            callout("Which one fits?", say ?? "Your note didn't clearly match an option.", Theme.caution, "questionmark.bubble")
        case .clarifying(.lowConfidence(let choice, let confidence, let say)):
            callout("Is it “\(choice)”?", (say ?? "") + " (confidence \(Int(confidence * 100))%) Tap to confirm, or pick another.",
                    Theme.caution, "questionmark.bubble")
        case .clarifying(.hedged(let choice, _)):
            callout("You sounded unsure. Is it “\(choice)”?", "Tap it to confirm, or pick another.",
                    Theme.caution, "questionmark.bubble")
        case .clarifying(.aiUnavailable):
            callout(engine.isPlainMode ? "Plain mode" : "AI unavailable right now",
                    "Pick the answer that matches what you see. The fix pack works without AI.", Theme.plain, "list.bullet.rectangle")
        default:
            EmptyView()
        }
    }

    private func callout(_ title: String, _ body: String, _ color: Color, _ symbol: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol).foregroundStyle(color).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.bold)).foregroundStyle(Theme.textPrimary)
                Text(body).font(.footnote).foregroundStyle(Theme.textSecondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func aiTurn(say: String, answer: String, interpretation: Interpretation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Understood: \(answer)").font(.subheadline.weight(.bold)).foregroundStyle(Theme.textPrimary)
                Spacer()
                InferenceBadge(kind: .init(interpretation.source, latencyMs: interpretation.latencyMs))
            }
            Button(action: undo) {
                Label("Not right? Undo", systemImage: "arrow.uturn.backward").font(.footnote.weight(.semibold))
            }
            .foregroundStyle(Theme.brand)
            .frame(minHeight: 32)
            DisclosureGroup("Why this step?") {
                Text(say).font(.footnote).foregroundStyle(Theme.textSecondary).frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.footnote.weight(.semibold))
        }
        .padding(12)
        .background(Theme.surfaceRaised, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func readingInput(_ ranges: [(option: String, range: ReadingRange)]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                TextField("Reading", text: $reading)
                    .keyboardType(.decimalPad)
                    .font(.title3.weight(.bold).monospacedDigit())
                    .padding(.horizontal, 14)
                    .frame(minHeight: Theme.minTarget)
                    .background(Theme.surfaceRaised, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if let unit = engine.step.ask?.unit { Text(unit).font(.headline).foregroundStyle(Theme.textSecondary) }
                Button("Enter") {
                    let value = Double(reading.replacingOccurrences(of: ",", with: "."))
                    readingRejected = !(value.map { engine.enterReading($0) } ?? false)
                    if !readingRejected { reading = "" }
                }
                .buttonStyle(PrimaryButtonStyle())
                .frame(width: 110)
                .disabled(reading.isEmpty)
            }
            Text(readingRejected ? "That value doesn't fall in one range. Pick an answer below." : "Fieldnote compares the number to the manual's ranges.")
                .font(.caption).foregroundStyle(readingRejected ? Theme.caution : Theme.textSecondary)
        }
    }

    // MARK: History

    private var historyTimeline: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Steps so far")
            ForEach(Array(engine.history.enumerated()), id: \.element.id) { index, entry in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)").font(.caption.weight(.bold).monospacedDigit())
                        .frame(width: 24, height: 24)
                        .background(Theme.surfaceRaised, in: Circle())
                        .foregroundStyle(Theme.textSecondary)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(entry.instruction).font(.subheadline).foregroundStyle(Theme.textPrimary)
                        HStack(spacing: 6) {
                            Image(systemName: icon(for: entry.via)).imageScale(.small).accessibilityHidden(true)
                            Text(entry.answer).font(.subheadline.weight(.semibold))
                        }
                        .foregroundStyle(Theme.brand)
                        if case .note(let text) = entry.via {
                            Text("“\(text)”").font(.caption).foregroundStyle(Theme.textSecondary).lineLimit(2)
                        }
                        if let i = entry.interpretation {
                            InferenceBadge(kind: .init(i.source, latencyMs: i.latencyMs))
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .card()
    }

    private func icon(for via: DiagnosisEngine.Via) -> String {
        switch via {
        case .tap: "hand.tap"
        case .reading: "gauge.with.dots.needle.bottom.50percent"
        case .note: "text.bubble"
        }
    }

    // MARK: Bottom bar

    @ViewBuilder
    private var bottomBar: some View {
        VStack(spacing: 8) {
            if engine.phase == .concluded {
                let hasReport = app.reports.report(forSession: run.sessionId) != nil
                Button {
                    path.append(.report(run))
                } label: {
                    Label(hasReport ? "View customer report" : "Create customer report", systemImage: "doc.text")
                }
                .buttonStyle(PrimaryButtonStyle())
                Button {
                    app.jobs.setStatus("done", for: run.job)
                    path.removeAll()
                } label: { Label("Finish job without report", systemImage: "checkmark.circle") }
                    .buttonStyle(SecondaryButtonStyle())
            } else {
                if engine.phase == .interpreting {
                    HStack(spacing: 8) {
                        ProgressView().tint(Theme.brand)
                        Text(expectsOnDevice ? "Understanding on this iPhone…" : "Understanding…")
                            .font(.footnote.weight(.semibold)).foregroundStyle(Theme.textSecondary)
                        Spacer()
                    }
                } else if isClarifying {
                    Label("Tap the answer that fits, above", systemImage: "arrow.up")
                        .font(.footnote.weight(.semibold)).foregroundStyle(Theme.caution)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Describe what you see…", text: $note, axis: .vertical)
                        .lineLimit(1...4)
                        .focused($noteFocused)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 14)
                        .frame(minHeight: Theme.minTarget)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(noteFocused ? Theme.brand : Theme.stroke))
                        .submitLabel(.send)
                        .onSubmit(send)
                    Button(action: send) {
                        Image(systemName: "arrow.up").font(.title3.weight(.bold))
                            .frame(width: Theme.minTarget, height: Theme.minTarget)
                            .foregroundStyle(Theme.onBrand)
                            .background(Theme.brand, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .disabled(note.trimmingCharacters(in: .whitespaces).isEmpty || engine.phase == .interpreting)
                    .accessibilityLabel("Send note")
                }
            }
        }
        .padding(Theme.gutter)
        .background(.ultraThinMaterial)
    }

    private func send() {
        let text = note
        guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        note = ""
        noteFocused = false
        Task { await engine.submitNote(text) }
    }

    private func elapsed(until date: Date) -> String {
        let minutes = max(0, Int(date.timeIntervalSince(engine.startedAt) / 60))
        return minutes < 1 ? "<1 min" : "\(minutes) min"
    }
}

struct ConclusionCard: View {
    let engine: DiagnosisEngine
    let outcome: FixPack.Outcome
    let onUndo: () -> Void
    /// Whether the tech did the fix on this visit; the report only says it was done when ticked.
    @Binding var repairDone: Bool
    /// Hidden once the report exists (it was written from the answer given then).
    var askRepairDone = true

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(title, systemImage: symbol)
                .font(Theme.heading(.title2))
                .foregroundStyle(color)
            Text(engine.step.instruction).font(.headline).foregroundStyle(Theme.textPrimary)
            Text(outcome.summary).font(.body).foregroundStyle(Theme.textPrimary)
            if outcome.kind == .fix && askRepairDone {
                Button { repairDone.toggle() } label: {
                    HStack(spacing: 12) {
                        Image(systemName: repairDone ? "checkmark.square.fill" : "square")
                            .font(.title3).foregroundStyle(repairDone ? Theme.brand : Theme.textSecondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("I completed this repair").font(.headline).foregroundStyle(Theme.textPrimary)
                            Text(repairDone ? "The report will say it was done." : "Leave unticked to list it as the recommended repair.")
                                .font(.footnote).foregroundStyle(Theme.textSecondary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .frame(minHeight: Theme.minTarget)
                    .background(Theme.surfaceRaised, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(repairDone ? .isSelected : [])
            }
            // When a note decided the last step, show how it was read so a misread is easy to catch.
            if let last = engine.history.last, case .note(let text) = last.via {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Based on your note “\(text)”, read as “\(last.answer)”.")
                        .font(.footnote).foregroundStyle(Theme.textSecondary)
                    Button(action: onUndo) {
                        Label("Not right? Undo last answer", systemImage: "arrow.uturn.backward")
                            .font(.footnote.weight(.semibold))
                    }
                    .foregroundStyle(Theme.brand)
                    .frame(minHeight: 32)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.surfaceRaised, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            if let parts = outcome.parts, !parts.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel(text: "Parts")
                    ForEach(parts, id: \.self) { part in
                        Label(part.prefix(1).uppercased() + part.dropFirst(), systemImage: "shippingbox").font(.subheadline).foregroundStyle(Theme.textPrimary)
                    }
                }
            }
            Divider().overlay(Theme.stroke)
            let notes = engine.history.compactMap(\.interpretation)
            let onDevice = notes.filter { $0.source == .onDevice }.count
            Text(Self.summary(steps: engine.history.count, notes: notes.count, onDevice: onDevice, stops: engine.acknowledgedStops.count))
                .font(.footnote).foregroundStyle(Theme.textSecondary)
        }
        .card()
        .overlay(RoundedRectangle(cornerRadius: Theme.corner).stroke(color.opacity(0.6), lineWidth: 1.5))
    }

    static func summary(steps: Int, notes: Int, onDevice: Int, stops: Int) -> String {
        func count(_ n: Int, _ word: String) -> String { "\(n) \(word)\(n == 1 ? "" : "s")" }
        var parts = [count(steps, "step")]
        if notes > 0 { parts.append("\(count(notes, "note")) understood (\(onDevice) on-device)") }
        if stops > 0 { parts.append(count(stops, "safety stop")) }
        return parts.joined(separator: " · ")
    }

    private var title: String {
        switch outcome.kind {
        case .fix: "Probable fix"
        case .escalate: "Needs deeper diagnosis"
        case .resolved: "Resolved"
        }
    }

    private var symbol: String {
        switch outcome.kind {
        case .fix: "wrench.and.screwdriver.fill"
        case .escalate: "arrow.up.forward.circle.fill"
        case .resolved: "checkmark.circle.fill"
        }
    }

    private var color: Color {
        switch outcome.kind {
        case .fix: Theme.brand
        case .escalate: Theme.caution
        case .resolved: Theme.onDevice
        }
    }
}
