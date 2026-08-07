/**
 * URL-state guarantees for the v2 tabs: every GscTab has a defined filter
 * allowlist (the `new Set(undefined)` TypeError class), `?rule=` round-trips
 * only on the digs tab, and the forced-prev-compare window math is exact.
 */
import {
  allowedFilterKeysForTab,
  buildSearchConsoleUrl,
  parseSearchConsoleUrl,
  pruneFiltersForTab,
  resolvePeriods,
  withPrevCompare,
  type SearchConsoleUrlState,
} from "./url-state";
import { GSC_DEFAULT_RANGE, GSC_RANGE_PRESETS, GSC_TABS } from "../types";

const BASE: SearchConsoleUrlState = {
  siteId: "d0aff5b6-0710-4848-8304-164db3c80ab7",
  tab: "digs",
  range: "90d",
  customFrom: null,
  customTo: null,
  compare: "none",
  filters: {},
  ruleId: null,
  insight: null,
};

describe("allowedFilterKeysForTab", () => {
  it("returns a defined array for EVERY tab (no undefined → Set crash)", () => {
    for (const tab of GSC_TABS) {
      expect(Array.isArray(allowedFilterKeysForTab(tab.key))).toBe(true);
    }
  });

  it("the non-dimension tabs accept no shared filters", () => {
    expect(allowedFilterKeysForTab("digs")).toEqual([]);
    expect(allowedFilterKeysForTab("watchlist")).toEqual([]);
    expect(allowedFilterKeysForTab("new-pages")).toEqual([]);
  });
});

describe("pruneFiltersForTab on the new tabs", () => {
  it("drops every filter and never throws", () => {
    for (const tab of ["digs", "watchlist", "new-pages"] as const) {
      expect(
        pruneFiltersForTab(tab, {
          query_contains: "solar",
          country: "usa",
          search_appearance: "AMP_BLUE_LINK",
        }),
      ).toEqual({});
    }
  });
});

describe("?rule round-trip", () => {
  it("survives build → parse on the digs tab", () => {
    const url = buildSearchConsoleUrl({ ...BASE, ruleId: "abc-123" });
    const parsed = parseSearchConsoleUrl(
      new URLSearchParams(url.split("?")[1]),
    );
    expect(parsed.tab).toBe("digs");
    expect(parsed.ruleId).toBe("abc-123");
  });

  it("is dropped when the tab is not digs", () => {
    const url = buildSearchConsoleUrl({
      ...BASE,
      tab: "queries",
      ruleId: "abc-123",
    });
    expect(url).not.toContain("rule=");
    const parsed = parseSearchConsoleUrl(
      new URLSearchParams("tab=queries&rule=abc-123"),
    );
    expect(parsed.ruleId).toBeNull();
  });
});

describe("range presets", () => {
  it("offers sub-28-day windows (daily/weekly analysis)", () => {
    const keys = GSC_RANGE_PRESETS.map((r) => r.key);
    expect(keys).toContain("1d");
    expect(keys).toContain("7d");
    expect(keys).toContain("14d");
  });

  it("every preset resolves a window of exactly its own length", () => {
    for (const preset of GSC_RANGE_PRESETS) {
      const { current } = resolvePeriods(
        {
          range: preset.key,
          customFrom: null,
          customTo: null,
          compare: "none",
        },
        new Date("2026-08-04T12:00:00Z"),
        "2026-07-20",
      );
      const days =
        Math.round(
          (Date.parse(`${current.end}T00:00:00Z`) -
            Date.parse(`${current.start}T00:00:00Z`)) /
            86_400_000,
        ) + 1;
      expect([preset.key, days]).toEqual([preset.key, preset.days]);
      expect(current.end).toBe("2026-07-20");
    }
  });

  it("an unknown range falls back to the NAMED default, not a list position", () => {
    // Guards the `GSC_RANGE_PRESETS[1]` trap: adding a preset at the front
    // silently retargeted the fallback.
    const expected = GSC_RANGE_PRESETS.find(
      (r) => r.key === GSC_DEFAULT_RANGE,
    );
    expect(expected).toBeDefined();
    const { current } = resolvePeriods(
      {
        range: "not-a-range" as never,
        customFrom: null,
        customTo: null,
        compare: "none",
      },
      new Date("2026-08-04T12:00:00Z"),
      "2026-07-20",
    );
    const days =
      Math.round(
        (Date.parse(`${current.end}T00:00:00Z`) -
          Date.parse(`${current.start}T00:00:00Z`)) /
          86_400_000,
      ) + 1;
    expect(days).toBe(expected?.days);
  });

  it("the default range is omitted from the URL and restored by parse", () => {
    const url = buildSearchConsoleUrl({ ...BASE, range: GSC_DEFAULT_RANGE });
    expect(url).not.toContain("range=");
    expect(
      parseSearchConsoleUrl(new URLSearchParams(url.split("?")[1] ?? "")).range,
    ).toBe(GSC_DEFAULT_RANGE);
  });

  it("a 1-day window compares against exactly the day before", () => {
    const periods = resolvePeriods(
      { range: "1d", customFrom: null, customTo: null, compare: "prev" },
      new Date("2026-08-04T12:00:00Z"),
      "2026-07-20",
    );
    expect(periods.current).toEqual({ start: "2026-07-20", end: "2026-07-20" });
    expect(periods.compare).toEqual({ start: "2026-07-19", end: "2026-07-19" });
  });
});

describe("withPrevCompare", () => {
  it("adds an equal-length window immediately before the current one", () => {
    const periods = resolvePeriods(
      { range: "28d", customFrom: null, customTo: null, compare: "none" },
      new Date("2026-08-04T12:00:00Z"),
      "2026-07-20",
    );
    expect(periods.compare).toBeNull();
    const forced = withPrevCompare(periods);
    expect(forced.current).toEqual(periods.current);
    expect(forced.compare).toEqual({
      start: "2026-05-26",
      end: "2026-06-22",
    });
  });

  it("is a no-op when a compare is already active", () => {
    const periods = resolvePeriods(
      { range: "28d", customFrom: null, customTo: null, compare: "yoy" },
      new Date("2026-08-04T12:00:00Z"),
      "2026-07-20",
    );
    expect(withPrevCompare(periods)).toEqual(periods);
  });
});
