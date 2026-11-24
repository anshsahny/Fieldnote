import Foundation
import Testing
@testable import Fieldnote

/// P6 hardening: error states say what happened and what the tech can do.
struct ErrorStateTests {
    @Test func firestoreErrorsBecomePlainMessages() {
        // FirestoreErrorCode: 7 = permissionDenied, 16 = unauthenticated.
        let denied = NSError(domain: "FIRFirestoreErrorDomain", code: 7)
        #expect(JobStore.message(for: denied).contains("isn't allowed"))
        let expired = NSError(domain: "FIRFirestoreErrorDomain", code: 16)
        #expect(JobStore.message(for: expired).contains("Sign out"))
        #expect(JobStore.message(for: nil).contains("Pull down"))
    }

    @Test func modelStatusSaysWhatToDo() {
        #expect(AIStatusCard.reason("unavailable: modelNotReady").contains("still downloading"))
        #expect(AIStatusCard.reason("unavailable: appleIntelligenceNotEnabled").contains("Turn on Apple Intelligence"))
        #expect(AIStatusCard.reason("unavailable: deviceNotEligible").contains("doesn't support"))
        #expect(!AIStatusCard.reason("unavailable: somethingNew").contains("somethingNew"))
    }
}
