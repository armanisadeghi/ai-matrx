/**
 * DateCellEditor's reading and writing of dates — the half of the new grid
 * date editor that can go wrong without anyone seeing it: a typed date read as
 * the wrong day, a stored date-only value shifted by the zone, or a datetime
 * written in a shape the old native input never wrote.
 *
 * Forced west of UTC, where a date-only string parsed as UTC lands a day early.
 */
import { fromStored, fromText, toStored } from "../components/DateCellEditor";

describe("DateCellEditor date reading", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("reads a stored date-only value as that calendar day, not a day early", () => {
    const d = fromStored("2026-01-01", "date");
    expect(d && toStored(d, "date")).toBe("2026-01-01");
  });

  it("round-trips a stored local datetime unchanged", () => {
    const d = fromStored("2026-09-22T06:00", "datetime");
    expect(d && toStored(d, "datetime")).toBe("2026-09-22T06:00");
  });

  it("reads the ways a person types a date", () => {
    for (const typed of ["9/30/2026", "2026-09-30", "Sep 30, 2026", "sep 30 2026", "September 30, 2026"]) {
      const d = fromText(typed, "date");
      expect(d && toStored(d, "date")).toBe("2026-09-30");
    }
  });

  it("reads a typed date with a time", () => {
    for (const typed of ["10/3/2026 4:15 pm", "Oct 3, 2026 4:15 PM", "2026-10-03 16:15"]) {
      const d = fromText(typed, "datetime");
      expect(d && toStored(d, "datetime")).toBe("2026-10-03T16:15");
    }
  });

  it("treats blank as clearing and nonsense as unreadable, never as a guess", () => {
    expect(fromText("   ", "date")).toBeNull();
    expect(fromText("next blursday", "date")).toBeUndefined();
    expect(fromText("next blursday", "datetime")).toBeUndefined();
  });
});
