/** N2 — "@today", "@tomorrow", "@<date>": what the "@" menu's Date group offers and how a date reads, in the PERSON's zone. */
import { dateChoices, dateTimeWords, dateWords, eventTime, parseTypedDate, remindAt } from "../date-mention";

const NY = "America/New_York";
const now = new Date("2026-10-07T19:30:00Z"); // Oct 7 2026, 3:30 PM in New York

describe("date mentions", () => {
  it("offers Today, Tomorrow, Yesterday for an empty '@' and filters by what is typed", () => {
    expect(dateChoices("", now, NY).map((c) => c.title)).toEqual(["Today", "Tomorrow", "Yesterday"]);
    expect(dateChoices("tom", now, NY)).toEqual([{ title: "Tomorrow", iso: "2026-10-08" }]);
  });
  it("reads typed dates in the usual spellings", () => {
    for (const q of ["2026-10-12", "10/12", "oct 12", "October 12 2026", "12 oct"]) expect(dateChoices(q, now, NY)).toEqual([{ title: "October 12, 2026", iso: "2026-10-12" }]);
    expect(parseTypedDate("feb 30", now, NY)).toBeNull();
    expect(parseTypedDate("hello", now, NY)).toBeNull();
  });
  it("reads relative words for the days around today", () => {
    expect(dateWords("2026-10-07", now, NY)).toBe("Today");
    expect(dateWords("2026-10-08", now, NY)).toBe("Tomorrow");
    expect(dateWords("2026-10-06", now, NY)).toBe("Yesterday");
    expect(dateTimeWords("2026-10-08T15:00", now, NY)).toBe("Tomorrow 3:00 PM");
  });
});

describe("the person's zone, not the device's", () => {
  // The device runs in one zone (jest's TZ), the person lives in another. 11:30 PM Oct 7 in Los Angeles is
  // already Oct 8 in Tokyo, and still Oct 7 in Honolulu: @today must follow the PERSON.
  const lateLA = new Date("2026-10-08T06:30:00Z");
  it("@today, @tomorrow and @yesterday are the person's days", () => {
    expect(dateChoices("", lateLA, "Asia/Tokyo")).toEqual([
      { title: "Today", iso: "2026-10-08" },
      { title: "Tomorrow", iso: "2026-10-09" },
      { title: "Yesterday", iso: "2026-10-07" },
    ]);
    expect(dateChoices("today", lateLA, "Pacific/Honolulu")).toEqual([{ title: "Today", iso: "2026-10-07" }]);
    expect(dateWords("2026-10-08", lateLA, "Asia/Tokyo")).toBe("Today");
    expect(dateWords("2026-10-08", lateLA, "Pacific/Honolulu")).toBe("Tomorrow");
  });
  it("a reminder fires at the wall time in the person's zone", () => {
    // 9:00 on Oct 12 in Tokyo (UTC+9) is 00:00 UTC; 3:00 PM in New York (EDT, UTC-4) is 19:00 UTC.
    expect(eventTime("2026-10-12", "Asia/Tokyo")?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(eventTime("2026-10-12T15:00", NY)?.toISOString()).toBe("2026-10-12T19:00:00.000Z");
    expect(remindAt("2026-10-12T15:00", "1h", NY)?.toISOString()).toBe("2026-10-12T18:00:00.000Z");
    // Across New York's clock change (Nov 1 2026): 9:00 EST is 14:00 UTC.
    expect(eventTime("2026-11-02", NY)?.toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });
});
