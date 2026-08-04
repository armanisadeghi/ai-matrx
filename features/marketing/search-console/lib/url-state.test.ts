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
import { GSC_TABS } from "../types";

const BASE: SearchConsoleUrlState = {
  siteId: "d0aff5b6-0710-4848-8304-164db3c80ab7",
  tab: "digs",
  range: "90d",
  customFrom: null,
  customTo: null,
  compare: "none",
  filters: {},
  ruleId: null,
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
