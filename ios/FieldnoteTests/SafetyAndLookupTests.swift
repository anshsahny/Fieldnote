import Testing
@testable import Fieldnote

struct SafetyGuardTests {
    let guardian = SafetyGuard(packStops: [])

    @Test(arguments: [
        ("I smell gas", "GAS"),
        ("smells like gas near the valve", "GAS"),
        ("customer says rotten egg odor in the basement", "GAS"),
        ("The CO alarm went off upstairs", "CO"),
        ("there's a burning smell from the blower", "BURNING"),
        ("water dripping on the control board", "WATER_ELECTRICAL"),
        ("wire is sparking at the transformer", "EXPOSED_WIRING"),
        ("rollout switch tripped again", "FLAME_ROLLOUT"),
    ])
    func stopsOnHazards(note: String, id: String) {
        #expect(guardian.check(note)?.id == id)
    }

    @Test(arguments: [
        "inducer runs but the pressure switch never closes",
        "the gas valve clicks but no flame",
        "flame looks lazy and yellow",
        "filter is filthy",
        "",
    ])
    func ignoresOrdinaryNotes(note: String) {
        #expect(guardian.check(note) == nil)
    }

    @Test func mergesPackTriggersWithUniversalOnes() {
        let custom = FixPack.SafetyStop(id: "GAS", triggers: ["meter spinning"], message: "pack message")
        let merged = SafetyGuard(packStops: [custom])
        #expect(merged.check("the gas meter is spinning fast")?.id == "GAS")
        #expect(merged.check("I smell gas")?.id == "GAS")
    }

    @Test func endOfNoteDoesNotCrash() {
        #expect(guardian.check("smell") == nil)
        #expect(guardian.check("there is a gas") == nil)
    }
}

struct FaultCodeLookupTests {
    let goodman = BundledPacks.load().first { $0.brand == "Goodman" }!
    let carrier = BundledPacks.load().first { $0.brand == "Carrier" }!

    @Test func exactMatchesIgnoreCaseAndSpacing() {
        guard case .exact(let fc) = FaultCodeLookup.lookup("ee 2", in: goodman) else { Issue.record("no match"); return }
        #expect(fc.code == "EE2")
        guard case .exact(let c) = FaultCodeLookup.lookup("3-1", in: carrier) else { Issue.record("no match"); return }
        #expect(c.code == "31")
    }

    @Test func suggestsSevenSegmentLookalikes() {
        // "EE6" exists; a tech typing "EEB" (b/6 look alike on a 7-segment display) gets it suggested.
        guard case .suggestions(let list) = FaultCodeLookup.lookup("EEB", in: goodman) else { Issue.record("no suggestions"); return }
        #expect(list.map(\.code).contains("EE6"))
    }

    @Test func unknownCodesReturnNone() {
        #expect(FaultCodeLookup.lookup("ZZ99", in: goodman) == .none)
        #expect(FaultCodeLookup.lookup("  ", in: goodman) == .none)
    }
}

struct ReadingRangeTests {
    @Test func parsesCommonForms() {
        #expect(ReadingRange.parse("below 0.5 uA") == ReadingRange(min: nil, max: 0.5, maxInclusive: false))
        #expect(ReadingRange.parse("0.5 uA or more") == ReadingRange(min: 0.5, max: nil, minInclusive: true))
        #expect(ReadingRange.parse("3.2-3.8 in. w.c.") == ReadingRange(min: 3.2, max: 3.8, minInclusive: true, maxInclusive: true))
        #expect(ReadingRange.parse("within range") == nil)
    }

    @Test func picksTheBranchByValueInCode() {
        let options = ["below 0.5 uA", "0.5 uA or more"]
        #expect(ReadingRange.option(for: 0.3, options: options) == "below 0.5 uA")
        #expect(ReadingRange.option(for: 0.5, options: options) == "0.5 uA or more")
        #expect(ReadingRange.option(for: 2, options: ["within range", "too high"]) == nil)
    }
}

struct NameplateExtractorTests {
    let extractor = NameplateExtractor(packs: BundledPacks.load())

    @Test func goodmanNameplateFromOCR() {
        let r = extractor.extract(lines: ["GOODMAN", "GAS-FIRED FORCED AIR FURNACE", "MODEL NO.", "GMVC960803BN", "SERIAL NO.", "1609123456"])
        #expect(r.brand == "Goodman")
        #expect(r.model == "GMVC960803BN")
        #expect(r.packId == "goodman-cvc96-mvc96-v1")
        #expect(r.serial == "1609123456")
    }

    @Test func toleratesLetterOForZero() {
        let r = extractor.extract(lines: ["MODEL GMVC96O8O3BN"])
        #expect(r.model == "GMVC960803BN")
    }

    @Test func carrierAndRheemModels() {
        #expect(extractor.extract(lines: ["CARRIER", "MODEL 59SC5B080E17--14", "SERIAL 2316A12345"]).packId == "carrier-59sc5b-v1")
        let rheem = extractor.extract(lines: ["RHEEM", "M/N R96VA0702317MSA S/N W461612345"])
        #expect(rheem.packId == "rheem-r96v-v1")
        #expect(rheem.model == "R96VA0702317MSA")
    }

    @Test func unknownEquipmentIsNotConfident() {
        let r = extractor.extract(lines: ["LENNOX", "MODEL EL296UH070XV36B", "SERIAL 5816K12345"])
        #expect(!r.confident)
        #expect(r.packId == nil)
    }

    @Test func parsesTheNameplateModelReply() {
        let reply = NameplateReply.parse("Brand: GOODMAN\nModel: GMVC960803BN\nSerial: unknown")
        #expect(reply.brand == "GOODMAN")
        #expect(reply.model == "GMVC960803BN")
        #expect(reply.serial == nil)
    }
}
