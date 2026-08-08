/**
 * UTC-safe date-window formatting: GSC days are `YYYY-MM-DD` strings and must
 * never pass through a local-timezone Date formatter (the off-by-one class
 * the header shipped with formatCompactDate).
 */
import {
  describeGscPeriods,
  describeGscWindow,
  formatGscDate,
  formatGscWindow,
} from "./format";

describe("formatGscDate", () => {
  it("formats an ISO day without timezone drift", () => {
    expect(formatGscDate("2026-07-09")).toBe("Jul 9, 2026");
    expect(formatGscDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatGscDate("2025-12-31")).toBe("Dec 31, 2025");
  });

  it("returns — for null or garbage", () => {
    expect(formatGscDate(null)).toBe("—");
    expect(formatGscDate("not-a-date")).toBe("—");
    expect(formatGscDate("2026-13-01")).toBe("—");
  });
});

describe("formatGscWindow", () => {
  it("states a shared year once", () => {
    expect(formatGscWindow({ start: "2026-07-09", end: "2026-08-05" })).toBe(
      "Jul 9 – Aug 5, 2026",
    );
  });

  it("states both years across a year boundary", () => {
    expect(formatGscWindow({ start: "2025-12-20", end: "2026-01-16" })).toBe(
      "Dec 20, 2025 – Jan 16, 2026",
    );
  });

  it("collapses a one-day window to a single date", () => {
    expect(formatGscWindow({ start: "2026-08-05", end: "2026-08-05" })).toBe(
      "Aug 5, 2026",
    );
  });
});

describe("describeGscWindow", () => {
  it("reads as between-prose for empty states", () => {
    expect(describeGscWindow({ start: "2026-07-09", end: "2026-08-05" })).toBe(
      "between Jul 9 and Aug 5, 2026",
    );
  });

  it("uses on-prose for a one-day window", () => {
    expect(describeGscWindow({ start: "2026-08-05", end: "2026-08-05" })).toBe(
      "on Aug 5, 2026",
    );
  });

  it("carries both years across a boundary", () => {
    expect(describeGscWindow({ start: "2025-12-20", end: "2026-01-16" })).toBe(
      "between Dec 20, 2025 and Jan 16, 2026",
    );
  });
});

describe("describeGscPeriods", () => {
  const current = { start: "2026-07-09", end: "2026-08-05" };
  const compare = { start: "2026-06-11", end: "2026-07-08" };

  it("names both windows when a compare is active", () => {
    expect(
      describeGscPeriods({ current, compare }, false),
    ).toBe("Evaluating Jul 9 – Aug 5, 2026 vs Jun 11 – Jul 8, 2026");
  });

  it("flags an auto-derived compare", () => {
    expect(describeGscPeriods({ current, compare }, true)).toBe(
      "Evaluating Jul 9 – Aug 5, 2026 vs Jun 11 – Jul 8, 2026 (auto — previous period of the same length)",
    );
  });

  it("says no compare when none applies", () => {
    expect(describeGscPeriods({ current, compare: null }, false)).toBe(
      "Evaluating Jul 9 – Aug 5, 2026 · no compare",
    );
  });
});
