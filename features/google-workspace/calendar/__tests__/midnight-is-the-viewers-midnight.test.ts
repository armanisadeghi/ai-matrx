/**
 * THE MIDNIGHT BOUNDARY, IN A ZONE THAT IS NOT THE RUNNER'S.
 *
 * This file exists because a suite that relies on the PROCESS timezone cannot
 * catch the real bug here: this CI box runs in UTC, so "read the local parts"
 * and "read the UTC parts" agree on every assertion and a wrong implementation
 * stays green. (`process.env.TZ` set inside a jest file does not take — V8 has
 * already cached the zone by the time a test module runs; that was measured, not
 * assumed.) So the day is computed in an EXPLICIT IANA zone that the assertions
 * name, and these cases can only pass for the right implementation on any
 * runner, in any zone.
 *
 * The two classes it pins:
 *   1. A TIMED event at 8pm New York is 00:00 UTC the NEXT day. Grouping off UTC
 *      files it under tomorrow — the person's "tonight" vanishes from Today.
 *   2. An ALL-DAY event is a DATE, stored as midnight UTC. Reading it in the
 *      viewer's zone files it a day EARLY in every negative-offset zone — a
 *      Sep 25 holiday shows on Sep 24.
 */

import {
  addDaysToKey,
  dayKeyInZone,
  eventLocalDay,
  eventTimeText,
  groupAgenda,
} from "../record";
import { CALENDAR_EVENT_ATTENDEES_KIND, type CalendarEventRow } from "../types";

const NEW_YORK = "America/New_York";
const TOKYO = "Asia/Tokyo";

function event(overrides: Partial<CalendarEventRow> & { id: string }): CalendarEventRow {
  return {
    custom_fields: {},
    all_day: false,
    attendees: { __kind: CALENDAR_EVENT_ATTENDEES_KIND, attendees: [] },
    calendar_id: "primary",
    created_at: "2026-09-18T00:00:00Z",
    created_by: "1f2e3d4c-5b6a-4978-8877-665544332211",
    deleted_at: null,
    ends_at: null,
    external_id: `google-${overrides.id}`,
    external_updated_at: null,
    location: null,
    meeting_url: null,
    metadata: {},
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    organizer_email: null,
    provider: "google",
    starts_at: null,
    sync_status: "available",
    sync_status_reason: null,
    synced_at: "2026-09-18T12:00:00Z",
    synced_via_connection_id: null,
    title: "Untitled",
    updated_at: "2026-09-18T12:00:00Z",
    updated_by: null,
    version: 1,
    visibility: "personal",
    ...overrides,
  };
}

describe("dayKeyInZone", () => {
  it("answers the day of the named zone, not of the runner", () => {
    const instant = new Date("2026-09-19T00:00:00Z");
    expect(dayKeyInZone(instant, NEW_YORK)).toBe("2026-09-18");
    expect(dayKeyInZone(instant, "UTC")).toBe("2026-09-19");
    expect(dayKeyInZone(instant, TOKYO)).toBe("2026-09-19");
  });

  it("falls back to UTC LOUDLY for a zone the browser does not know", () => {
    const scream = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(dayKeyInZone(new Date("2026-09-19T00:00:00Z"), "Mars/Olympus")).toBe("2026-09-19");
    expect(scream).toHaveBeenCalledWith(expect.stringContaining("Mars/Olympus"));
    scream.mockRestore();
  });

  it("walks days without touching local time", () => {
    expect(addDaysToKey("2026-09-18", 1)).toBe("2026-09-19");
    expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("in America/New_York", () => {
  const now = new Date("2026-09-18T13:00:00Z"); // 9am in New York

  it("a late-evening event stays on TODAY, not tomorrow", () => {
    // 8pm Sep 18 in New York == 2026-09-19T00:00:00Z.
    const tonight = event({ id: "tonight", title: "Dinner", starts_at: "2026-09-19T00:00:00Z" });
    expect(eventLocalDay(tonight, NEW_YORK)).toBe("2026-09-18");
    const groups = groupAgenda([tonight], 7, now, NEW_YORK);
    expect(groups.find((group) => group.key === "today")!.events.map((r) => r.id)).toEqual([
      "tonight",
    ]);
    expect(groups.find((group) => group.key === "tomorrow")!.events).toEqual([]);
  });

  it("an all-day event stays on the DATE Google gave, not the day before", () => {
    const holiday = event({
      id: "holiday",
      title: "Clinic closed",
      all_day: true,
      starts_at: "2026-09-25T00:00:00Z",
    });
    expect(eventLocalDay(holiday, NEW_YORK)).toBe("2026-09-25");
    const groups = groupAgenda([holiday], 14, now, NEW_YORK);
    expect(groups.find((group) => group.day === "2026-09-24")?.events ?? []).toEqual([]);
    expect(groups.find((group) => group.day === "2026-09-25")!.events.map((r) => r.id)).toEqual([
      "holiday",
    ]);
  });

  it("the time is printed in the viewer's zone, and an all-day event has no time", () => {
    const morning = event({
      id: "am",
      starts_at: "2026-09-18T13:00:00Z",
      ends_at: "2026-09-18T13:30:00Z",
    });
    expect(eventTimeText(morning, NEW_YORK)).toContain("9:00");
    expect(eventTimeText(morning, TOKYO)).toContain("10:00"); // 22:00 JST
    expect(
      eventTimeText(event({ id: "all", all_day: true, starts_at: "2026-09-18T00:00:00Z" }), NEW_YORK),
    ).toBe("All day");
  });
});

describe("in Asia/Tokyo", () => {
  it("an early-morning UTC event is already tomorrow there, and is grouped there", () => {
    // 2026-09-18T20:00:00Z is 05:00 on Sep 19 in Tokyo.
    const now = new Date("2026-09-18T20:00:00Z");
    expect(dayKeyInZone(now, TOKYO)).toBe("2026-09-19");
    const breakfast = event({ id: "bf", starts_at: "2026-09-18T23:00:00Z" }); // 08:00 Sep 19 JST
    const groups = groupAgenda([breakfast], 7, now, TOKYO);
    expect(groups.find((group) => group.key === "today")!.events.map((r) => r.id)).toEqual(["bf"]);
  });
});
