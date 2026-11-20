import Foundation
import FoundationModels

/// Records tool calls so the spike can prove the model actually called the tool.
actor ToolCallRecorder {
    private(set) var calls: [String] = []
    func record(_ call: String) { calls.append(call) }
}

/// P1 probe for native on-device function calling through the Firebase hybrid session.
/// Facts come from the (cached) fix pack, never from the model.
nonisolated struct FaultCodeLookupTool: FoundationModels.Tool {
    let name = "lookupFaultCode"
    let description = "Looks up what a furnace status-LED flash code means in the technician's cached fix pack."

    @Generable
    struct Arguments {
        @Guide(description: "The number of LED flashes, as digits, for example \"3\".")
        var code: String
    }

    let table: [String: String]
    let recorder: ToolCallRecorder

    @concurrent func call(arguments: Arguments) async throws -> String {
        let code = arguments.code.filter(\.isNumber)
        await recorder.record(code)
        return table[code].map { "Code \(code): \($0)" } ?? "Code \(code) is not in the fix pack."
    }
}
