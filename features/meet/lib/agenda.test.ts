import type { UpcomingOccurrence } from "@ai-matrx/meet";
import { dayLabel, groupByDay, isLive, upcomingRows } from "./agenda";
import {
  formatTimeRange,
  utcToZoned,
  zoneOffsetMinutes,
  zonedToUtcIso,
} from "./zoned-time";

function occurrence(overrides: Partial<UpcomingOccurrence>): UpcomingOccurrence {
  return {
    meetingId: "m1" as UpcomingOccurrence["meetingId"],
    originalStart: "2026-10-06T17:00:00.000Z",
    occurrenceStart: "2026-10-06T17:00:00.000Z",
    durationMinutes: 30,
    state: "scheduled",
    sequence: 0,
    organizationId: "o1" as UpcomingOccurrence["organizationId"],
    title: "Weekly client check-in",
    slug: "abc-defg-hij",
    kind: "recurring",
    hostUserId: "u1" as UpcomingOccurrence["hostUserId"],
    timeZone: "America/Los_Angeles",
    meetingCancelled: false,
    myRsvp: null,
    myRole: "host",
    ...overrides,
  };
}

describe("wall-clock time in a named zone", () => {
  it("10:00 in Los Angeles is 17:00 UTC in October and 18:00 UTC after DST ends", () => {
    expect(zonedToUtcIso("2026-10-06", "10:00", "America/Los_Angeles")).toBe("2026-10-06T17:00:00.000Z");
    expect(zonedToUtcIso("2026-11-03", "10:00", "America/Los_Angeles")).toBe("2026-11-03T18:00:00.000Z");
    expect(zonedToUtcIso("2026-10-06", "10:00", "Asia/Tokyo")).toBe("2026-10-06T01:00:00.000Z");
  });

  it("reads an instant back as the clock in that zone", () => {
    expect(utcToZoned("2026-10-06T17:00:00.000Z", "America/Los_Angeles")).toEqual({
      date: "2026-10-06",
      time: "10:00",
      weekday: 2,
      day: 6,
    });
    expect(zoneOffsetMinutes(Date.parse("2026-07-01T00:00:00Z"), "America/Los_Angeles")).toBe(-420);
  });

  it("writes a range with the zone's name", () => {
    expect(formatTimeRange("2026-10-06T17:00:00.000Z", 30, "America/Los_Angeles", "en-US")).toBe(
      "10:00 AM – 10:30 AM PDT",
    );
  });
});

describe("occurrences grouped by day in the viewer's zone", () => {
  const now = new Date("2026-10-06T15:00:00.000Z"); // 8 AM Tuesday in Los Angeles

  it("groups by the LOCAL day, earliest first, naming Today and Tomorrow", () => {
    const days = groupByDay(
      [
        occurrence({ occurrenceStart: "2026-10-07T17:00:00.000Z", title: "Design review" }),
        occurrence({ occurrenceStart: "2026-10-06T17:00:00.000Z" }),
        occurrence({ occurrenceStart: "2026-10-06T21:00:00.000Z", title: "Pipeline sync" }),
        occurrence({ occurrenceStart: "2026-10-09T16:00:00.000Z", title: "Board prep" }),
      ],
      "America/Los_Angeles",
      now,
      "en-US",
    );
    expect(days.map((d) => d.label)).toEqual(["Today", "Tomorrow", "Friday, October 9"]);
    expect(days[0]!.items.map((i) => i.title)).toEqual(["Weekly client check-in", "Pipeline sync"]);
  });

  it("the same instant is a different day for a reader in Tokyo", () => {
    // Tuesday 17:00 LA = Wednesday 09:00 Tokyo — and "now" (Tue 8 AM LA) is
    // already Wednesday midnight in Tokyo, so for that reader it is Today.
    const [day] = groupByDay([occurrence({})], "Asia/Tokyo", now, "en-US");
    expect(day!.key).toBe("2026-10-07");
    expect(day!.label).toBe("Today");
    const [la] = groupByDay([occurrence({})], "America/Los_Angeles", now, "en-US");
    expect(la!.key).toBe("2026-10-06");
  });

  it("a date in another year says the year", () => {
    expect(dayLabel("2027-01-05", "America/Los_Angeles", now, "en-US")).toBe("Tuesday, January 5, 2027");
  });
});

describe("what the Upcoming list shows", () => {
  const now = new Date("2026-10-06T17:10:00.000Z");

  it("keeps a live meeting, drops a finished one, and marks the live one", () => {
    const live = occurrence({});
    const over = occurrence({ occurrenceStart: "2026-10-06T15:00:00.000Z" });
    expect(upcomingRows([live, over], { scope: "mine", query: "", now })).toEqual([live]);
    expect(isLive(live, now)).toBe(true);
  });

  it("shows only the reader's own meetings — never every meeting RLS lets an admin see", () => {
    const colleagues = occurrence({ myRole: null, title: "Someone else's standup" });
    const invited = occurrence({ myRole: "invitee", title: "Vendor demo" });
    const mine = occurrence({});
    expect(upcomingRows([colleagues, invited, mine], { scope: "mine", query: "", now }).map((r) => r.title)).toEqual([
      "Vendor demo",
      "Weekly client check-in",
    ]);
    expect(upcomingRows([invited, mine], { scope: "hosting", query: "", now })).toEqual([mine]);
    expect(upcomingRows([invited, mine], { scope: "invited", query: "", now })).toEqual([invited]);
  });

  it("searches titles, and leaves whole-meeting cancellations to the Cancelled tab", () => {
    const cancelled = occurrence({ meetingCancelled: true });
    const skipped = occurrence({ state: "cancelled", title: "Weekly client check-in" });
    expect(upcomingRows([cancelled, skipped], { scope: "mine", query: "client", now })).toEqual([skipped]);
    expect(upcomingRows([skipped], { scope: "mine", query: "board", now })).toEqual([]);
  });
});
