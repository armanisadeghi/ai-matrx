/**
 * DateCellEditor's reading and writing of dates — the half of the new grid
 * date editor that can go wrong without anyone seeing it: a typed date read as
 * the wrong day, a stored date-only value shifted by the zone, or a datetime
 * written in a shape the other grids never write. A date & time is stored as an
 * ABSOLUTE INSTANT (grids review 3: the Sheet wrote the zone-less
 * `2026-10-03T12:00` while the record grids wrote `2026-10-03T19:00:00.000Z`).
 *
 * Forced west of UTC, where a date-only string parsed as UTC lands a day early.
 */
import { fromStored, fromText, toStored } from "../components/DateCellEditor";
import { readDateCellWords } from "../date-cell-words";

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

  it("round-trips a stored instant unchanged", () => {
    const d = fromStored("2026-09-22T13:00:00.000Z", "datetime");
    expect(d && toStored(d, "datetime")).toBe("2026-09-22T13:00:00.000Z");
  });

  it("stores a date & time as the instant the record grids store, in the viewer's zone", () => {
    // 12:00 PM in Los Angeles on Oct 3 2026 (PDT, UTC-7) is 19:00 UTC — the merged grid's own value.
    const d = fromText("10/03/2026 1200PM", "datetime");
    expect(d && toStored(d, "datetime")).toBe("2026-10-03T19:00:00.000Z");
    expect(readDateCellWords("10/03/2026 1200PM", "datetime")).toEqual({ ok: true, stored: "2026-10-03T19:00:00.000Z" });
  });

  it("puts a time typed alone on the day the cell already holds, and says so when there is none", () => {
    expect(readDateCellWords("1200PM", "datetime", "2026-10-03T16:00:00.000Z")).toEqual({ ok: true, stored: "2026-10-03T19:00:00.000Z" });
    const none = readDateCellWords("1200PM", "datetime", null);
    expect(none.ok).toBe(false);
    expect(!none.ok && none.why).toMatch(/no day yet/);
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
      expect(d && toStored(d, "datetime")).toBe("2026-10-03T23:15:00.000Z");
    }
  });

  it("treats blank as clearing and nonsense as unreadable, never as a guess", () => {
    expect(fromText("   ", "date")).toBeNull();
    expect(fromText("next blursday", "date")).toBeUndefined();
    expect(fromText("next blursday", "datetime")).toBeUndefined();
  });
});
