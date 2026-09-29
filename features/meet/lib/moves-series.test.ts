/**
 * Moving a whole series re-homes or archives its per-date changes, so the form
 * must ASK first (verifier, 2026-09-29: a cancelled date came back silently).
 * `movesSeries` decides when that question exists.
 */
import type { MeetingRecord } from "@ai-matrx/meet";
import { movesSeries } from "./meeting-draft";

const series = {
  recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
  scheduledFor: "2026-10-06T17:00:00.000Z",
  timeZone: "America/Los_Angeles",
} as Pick<MeetingRecord, "recurrenceRule" | "scheduledFor" | "timeZone">;

describe("movesSeries", () => {
  it("a new first start, rule or zone moves the series", () => {
    expect(movesSeries(series, { scheduledFor: "2026-10-06T18:00:00.000Z" })).toBe(true);
    expect(movesSeries(series, { recurrenceRule: "FREQ=WEEKLY;BYDAY=WE" })).toBe(true);
    expect(movesSeries(series, { timeZone: "America/New_York" })).toBe(true);
  });

  it("a title, a length, or the same instant does not", () => {
    expect(movesSeries(series, { title: "Renewal review" })).toBe(false);
    expect(movesSeries(series, { scheduledDurationMinutes: 45 })).toBe(false);
    expect(movesSeries(series, { scheduledFor: "2026-10-06T17:00:00Z" })).toBe(false);
  });

  it("a one-off meeting has no series to move", () => {
    expect(
      movesSeries({ ...series, recurrenceRule: null }, { scheduledFor: "2026-10-06T18:00:00.000Z" }),
    ).toBe(false);
  });
});
