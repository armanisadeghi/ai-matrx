// A SUBSCRIBED CALENDAR PARSES AND DRAWS AT THE RIGHT TIME (lane CAL-FEED-CHART, 2026-10-08).
// A content manager subscribes her phone to "Client content calendar": three posts, one all-day launch,
// one two-day shoot, one timed review in Los Angeles with a comma and a newline in its notes.
import ICAL from "ical.js";
import { buildIcs, fold, momentOf, type FeedRead } from "./ics";

const feed: FeedRead = {
  status: "ok", title: "Client content calendar", table_id: "t1", time_zone: "America/Los_Angeles",
  description_field: "notes", date_field: "publish_on", end_field: "ends_on",
  table: { name: "Client content calendar", title_field: "post" },
  rows: [
    { id: "r1", document: { post: "Spring launch post", publish_on: "2026-10-12", notes: "Hero image, short copy;\nlink in bio" } },
    { id: "r2", document: { post: "Brand shoot", publish_on: "2026-10-14", ends_on: "2026-10-15" } },
    { id: "r3", document: { post: "Client review call", publish_on: "2026-10-16T09:30:00", ends_on: "2026-10-16T10:15:00" } },
    { id: "r4", document: { post: "Undated idea" } },
  ],
};
const ics = buildIcs(feed, { origin: "https://www.aimatrx.com", now: new Date("2026-10-08T12:00:00Z") });
const events = () => {
  const comp = new ICAL.Component(ICAL.parse(ics));
  return comp.getAllSubcomponents("vevent").map((e) => new ICAL.Event(e));
};

describe("the calendar feed", () => {
  it("is a valid calendar a parser reads, with one event per dated record", () => {
    expect(events().map((e) => e.summary)).toEqual(["Spring launch post", "Brand shoot", "Client review call"]);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it("draws an all-day record as a date, and a two-day record across both days", () => {
    const [launch, shoot] = events();
    expect(launch!.startDate.isDate).toBe(true);
    expect(launch!.startDate.toString()).toBe("2026-10-12");
    expect(launch!.endDate.toString()).toBe("2026-10-13");
    expect(shoot!.endDate.toString()).toBe("2026-10-16");
  });
  it("puts a timed record at the owner's wall clock (9:30 in Los Angeles is 16:30 UTC)", () => {
    const review = events()[2]!;
    expect(review.startDate.toJSDate().toISOString()).toBe("2026-10-16T16:30:00.000Z");
    expect(review.endDate.toJSDate().toISOString()).toBe("2026-10-16T17:15:00.000Z");
  });
  it("carries the description (escaped and restored) and a link back to the record", () => {
    const launch = events()[0]!;
    expect(launch.description).toBe("Hero image, short copy;\nlink in bio");
    expect(launch.component.getFirstPropertyValue("url")).toBe("https://www.aimatrx.com/data/t1/r/r1");
    expect(launch.uid).toBe("r1@aimatrx.com");
    // RFC 5545 TEXT: a semicolon and a comma are escaped on the wire, whatever a lenient parser tolerates.
    expect(ics).toContain("DESCRIPTION:Hero image\\, short copy\\;\\nlink in bio");
  });
  it("is empty, not broken, when the owner can read nothing", () => {
    const empty = buildIcs({ ...feed, rows: [] }, { origin: "https://x" });
    expect(new ICAL.Component(ICAL.parse(empty)).getAllSubcomponents("vevent")).toHaveLength(0);
  });
});

describe("time", () => {
  it("reads a value with an offset as that instant and daylight saving in the zone", () => {
    expect(momentOf("2026-10-16T09:30:00-07:00", "UTC")).toEqual({ kind: "instant", at: new Date("2026-10-16T16:30:00Z") });
    expect(momentOf("2026-12-16T09:30:00", "America/Los_Angeles")).toEqual({ kind: "instant", at: new Date("2026-12-16T17:30:00Z") });
  });
  it("folds a long line without splitting a character", () => {
    const folded = fold("SUMMARY:" + "é".repeat(80));
    expect(folded.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "é".repeat(80));
  });
});
