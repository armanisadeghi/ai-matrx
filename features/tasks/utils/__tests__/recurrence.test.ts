/**
 * D129 — monthly recurrence must not lose its month-end anchor across
 * successive rolls (Jan 31 → Feb 28 → Mar 28 forever). BYMONTHDAY persists
 * the original anchor; nextOccurrence honors it over the current due date.
 */
import {
  parseRecurrenceRule,
  formatRecurrenceRule,
  describeRecurrenceRule,
  ensureMonthDayAnchor,
  nextOccurrence,
} from "../recurrence";

describe("BYMONTHDAY parse/format round-trip", () => {
  it("parses BYMONTHDAY on MONTHLY", () => {
    expect(parseRecurrenceRule("FREQ=MONTHLY;BYMONTHDAY=31")).toEqual({
      freq: "MONTHLY",
      interval: 1,
      byDay: undefined,
      byMonthDay: 31,
    });
  });

  it("parses BYMONTHDAY=-1 (last day)", () => {
    expect(parseRecurrenceRule("FREQ=MONTHLY;BYMONTHDAY=-1")?.byMonthDay).toBe(
      -1,
    );
  });

  it("ignores BYMONTHDAY on non-monthly freqs and out-of-range values", () => {
    expect(
      parseRecurrenceRule("FREQ=WEEKLY;BYMONTHDAY=15")?.byMonthDay,
    ).toBeUndefined();
    expect(
      parseRecurrenceRule("FREQ=MONTHLY;BYMONTHDAY=0")?.byMonthDay,
    ).toBeUndefined();
    expect(
      parseRecurrenceRule("FREQ=MONTHLY;BYMONTHDAY=32")?.byMonthDay,
    ).toBeUndefined();
  });

  it("round-trips through format", () => {
    const rule = "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=31";
    expect(formatRecurrenceRule(parseRecurrenceRule(rule)!)).toBe(rule);
  });

  it("describes the anchor", () => {
    expect(describeRecurrenceRule("FREQ=MONTHLY;BYMONTHDAY=31")).toBe(
      "Every month on day 31",
    );
    expect(describeRecurrenceRule("FREQ=MONTHLY;BYMONTHDAY=-1")).toBe(
      "Every month on the last day",
    );
  });
});

describe("ensureMonthDayAnchor", () => {
  it("stamps the due date's day into an unanchored MONTHLY rule", () => {
    expect(ensureMonthDayAnchor("FREQ=MONTHLY", "2026-01-31")).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=31",
    );
  });

  it("stamps YEARLY rules too", () => {
    expect(ensureMonthDayAnchor("FREQ=YEARLY", "2024-02-29")).toBe(
      "FREQ=YEARLY;BYMONTHDAY=29",
    );
  });

  it("no-ops when already anchored, non-monthly, or unparseable", () => {
    expect(
      ensureMonthDayAnchor("FREQ=MONTHLY;BYMONTHDAY=31", "2026-02-28"),
    ).toBeNull();
    expect(ensureMonthDayAnchor("FREQ=DAILY", "2026-01-31")).toBeNull();
    expect(ensureMonthDayAnchor("garbage", "2026-01-31")).toBeNull();
  });

  it("preserves interval when stamping", () => {
    expect(ensureMonthDayAnchor("FREQ=MONTHLY;INTERVAL=3", "2026-01-31")).toBe(
      "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=31",
    );
  });
});

describe("nextOccurrence honors the persistent anchor", () => {
  it("clamps into short months but recovers month-end (the D129 repro)", () => {
    // First roll (unanchored) still clamps correctly.
    expect(nextOccurrence("FREQ=MONTHLY", "2026-01-31")).toBe("2026-02-28");
    // With the stamped anchor, the roll off Feb 28 recovers to Mar 31 —
    // previously it stayed on the 28th forever.
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=31", "2026-02-28")).toBe(
      "2026-03-31",
    );
    // And keeps recovering across later short months.
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=31", "2026-04-30")).toBe(
      "2026-05-31",
    );
  });

  it("BYMONTHDAY=-1 always lands on the last day", () => {
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=-1", "2026-01-31")).toBe(
      "2026-02-28",
    );
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=-1", "2026-02-28")).toBe(
      "2026-03-31",
    );
    // Leap year February.
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=-1", "2028-01-31")).toBe(
      "2028-02-29",
    );
  });

  it("yearly leap-day anchor recovers on leap years", () => {
    expect(nextOccurrence("FREQ=YEARLY;BYMONTHDAY=29", "2025-02-28")).toBe(
      "2026-02-28",
    );
    expect(nextOccurrence("FREQ=YEARLY;BYMONTHDAY=29", "2027-02-28")).toBe(
      "2028-02-29",
    );
  });

  it("late completion still lands after today with the anchor kept", () => {
    expect(
      nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=31", "2026-02-28", "2026-05-15"),
    ).toBe("2026-05-31");
  });
});
