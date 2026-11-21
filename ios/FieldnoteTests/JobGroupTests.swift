import FirebaseFirestore
import Foundation
import Testing
@testable import Fieldnote

@MainActor
struct JobGroupTests {
    private let calendar = Calendar(identifier: .gregorian)
    private var now: Date { calendar.date(from: DateComponents(year: 2026, month: 11, day: 20, hour: 12))! }

    private func job(_ id: String, hoursFromNow: Double?, status: String = "scheduled") -> Job {
        var data: [String: Any] = ["status": status]
        if let h = hoursFromNow { data["scheduledFor"] = Timestamp(date: now.addingTimeInterval(h * 3600)) }
        return Job(id: id, data: data)
    }

    @Test func splitsTodayEarlierAndUpcoming() {
        let jobs = [
            job("yesterday-open", hoursFromNow: -24),
            job("yesterday-done", hoursFromNow: -24, status: "done"),
            job("this-morning", hoursFromNow: -3),
            job("this-afternoon", hoursFromNow: 3),
            job("unscheduled", hoursFromNow: nil),
            job("tomorrow", hoursFromNow: 22),
        ]
        let groups = JobGroup.make(jobs, now: now, calendar: calendar)
        #expect(groups.map(\.id) == ["earlier", "today", "upcoming"])
        #expect(groups[0].jobs.map(\.id) == ["yesterday-open"])
        #expect(groups[1].jobs.map(\.id) == ["this-morning", "this-afternoon", "unscheduled"])
        #expect(groups[1].title == "3 jobs today")
        #expect(groups[2].jobs.map(\.id) == ["tomorrow"])
    }

    @Test func todayGroupAlwaysPresent() {
        let groups = JobGroup.make([job("tomorrow", hoursFromNow: 22)], now: now, calendar: calendar)
        #expect(groups.map(\.id) == ["today", "upcoming"])
        #expect(groups[0].title == "0 jobs today")
    }

    @Test func whenLabels() {
        #expect(!JobGroup.when(now.addingTimeInterval(3600), now: now, calendar: calendar).contains("Tomorrow"))
        #expect(JobGroup.when(now.addingTimeInterval(22 * 3600), now: now, calendar: calendar).hasPrefix("Tomorrow "))
        #expect(JobGroup.when(now.addingTimeInterval(72 * 3600), now: now, calendar: calendar).hasPrefix("Mon "))
    }
}
