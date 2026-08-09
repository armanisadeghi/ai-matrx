import { shapeGscClassRollup } from "./useGscClassRollup";
import { shapeGscPortfolioRollup } from "./useGscPortfolioRollup";
import { resolveGscDataThrough } from "@/features/marketing/search-console/lib/url-state";
import type {
  GscClassSummaryRow,
  GscResolvedPeriods,
} from "@/features/marketing/search-console/types";

const PERIODS: GscResolvedPeriods = {
  current: { start: "2026-06-29", end: "2026-07-26" },
  compare: { start: "2026-06-01", end: "2026-06-28" },
};

function row(
  traffic_class: string,
  clicks: number,
  cmp_clicks: number,
  extra: Partial<GscClassSummaryRow> = {},
): GscClassSummaryRow {
  return {
    traffic_class,
    clicks,
    cmp_clicks,
    impressions: clicks * 10,
    cmp_impressions: cmp_clicks * 10,
    queries: 5,
    cmp_queries: 5,
    ...extra,
  } as GscClassSummaryRow;
}

describe("shapeGscClassRollup", () => {
  it("zero-fills every canonical class so a missing class reads as 0, not a hole", () => {
    const rollup = shapeGscClassRollup([row("money", 100, 80)], PERIODS);
    // All five classes present even though the RPC returned one.
    expect(rollup.classes.map((c) => c.key)).toEqual([
      "money",
      "educational",
      "brand",
      "mismatch",
      "unclassified",
    ]);
    const educational = rollup.classes.find((c) => c.key === "educational")!;
    expect(educational.clicks).toBe(0);
    expect(educational.deltaPct).toBeNull();
  });

  it("computes per-class deltas and shares against the period total", () => {
    const rollup = shapeGscClassRollup(
      [row("money", 50, 100), row("brand", 150, 100)],
      PERIODS,
    );
    const money = rollup.classes.find((c) => c.key === "money")!;
    const brand = rollup.classes.find((c) => c.key === "brand")!;

    expect(money.deltaClicks).toBe(-50);
    expect(money.deltaPct).toBeCloseTo(-0.5);
    expect(money.share).toBeCloseTo(0.25);
    expect(brand.deltaPct).toBeCloseTo(0.5);
    expect(brand.share).toBeCloseTo(0.75);
  });

  it("surfaces the decomposition the doctrine exists for: total up, money down", () => {
    // The worked example — a site "+25%" overall while money traffic FELL.
    const rollup = shapeGscClassRollup(
      [row("money", 97, 100), row("brand", 153, 100)],
      PERIODS,
    );
    expect(rollup.totalClicks).toBe(250);
    expect(rollup.totalDeltaPct).toBeCloseTo(0.25); // headline says +25%
    const money = rollup.classes.find((c) => c.key === "money")!;
    expect(money.deltaPct).toBeLessThan(0); // the truth underneath
  });

  it("returns null deltaPct rather than a fake +100% when the compare window was empty", () => {
    const rollup = shapeGscClassRollup([row("money", 40, 0)], PERIODS);
    const money = rollup.classes.find((c) => c.key === "money")!;
    expect(money.deltaPct).toBeNull();
    expect(money.deltaClicks).toBe(40);
  });

  it("reports hasData from impressions alone (ranking with no clicks is still data)", () => {
    const impressionsOnly = shapeGscClassRollup(
      [row("money", 0, 0, { impressions: 900, cmp_impressions: 800 })],
      PERIODS,
    );
    expect(impressionsOnly.totalClicks).toBe(0);
    expect(impressionsOnly.hasData).toBe(true);

    expect(shapeGscClassRollup([], PERIODS).hasData).toBe(false);
  });

  it("keeps every share at 0 instead of dividing by zero on an empty period", () => {
    const rollup = shapeGscClassRollup([row("money", 0, 10)], PERIODS);
    expect(rollup.classes.every((c) => c.share === 0)).toBe(true);
    expect(rollup.totalDeltaPct).toBeCloseTo(-1);
  });
});

describe("resolveGscDataThrough", () => {
  it("takes the freshest day across profiles", () => {
    expect(
      resolveGscDataThrough([
        { dimension_profile: "query", max_date: "2026-07-24" },
        { dimension_profile: "page", max_date: "2026-07-26" },
      ]),
    ).toBe("2026-07-26");
  });

  it("ignores search_appearance, whose history is deliberately shallow", () => {
    // Without the exclusion this would drag the site's freshness back a month
    // and silently shorten every window built from it.
    expect(
      resolveGscDataThrough([
        { dimension_profile: "page", max_date: "2026-07-26" },
        { dimension_profile: "search_appearance", max_date: "2026-06-30" },
      ]),
    ).toBe("2026-07-26");
  });

  it("returns null for no rows so resolvePeriods falls back to the wall clock", () => {
    expect(resolveGscDataThrough([])).toBeNull();
    expect(resolveGscDataThrough(undefined)).toBeNull();
  });
});

describe("shapeGscPortfolioRollup (adversarial-review regressions)", () => {
  const P = PERIODS;

  it("reports sites contributing across ALL classes, not per class", () => {
    // v1 counted distinct sites INSIDE group-by-class, so a brand whose two
    // sites had disjoint classes rendered "1 of 2 sites". The RPC now returns
    // the portfolio-wide count on every row.
    const rollup = shapeGscPortfolioRollup(
      [
        { traffic_class: "money", clicks: 10, cmp_clicks: 8, impressions: 100, cmp_impressions: 90, sites: 2 },
        { traffic_class: "educational", clicks: 5, cmp_clicks: 4, impressions: 50, cmp_impressions: 40, sites: 2 },
      ],
      P,
    );
    expect(rollup.contributingSites).toBe(2);
  });

  it("keeps a class that collapsed to zero clicks", () => {
    // money 500 -> 0 is the single most important thing the bar can say;
    // filtering on clicks > 0 deleted it from the legend entirely.
    const rollup = shapeGscPortfolioRollup(
      [
        { traffic_class: "money", clicks: 0, cmp_clicks: 500, impressions: 0, cmp_impressions: 9000, sites: 1 },
        { traffic_class: "educational", clicks: 100, cmp_clicks: 100, impressions: 900, cmp_impressions: 900, sites: 1 },
      ],
      P,
    );
    const money = rollup.classes.find((c) => c.key === "money")!;
    expect(money.cmpClicks).toBe(500);
    expect(money.deltaPct).toBeCloseTo(-1);
    // The component keeps rows where clicks > 0 OR cmpClicks > 0.
    expect(money.clicks > 0 || money.cmpClicks > 0).toBe(true);
  });

  it("has no contributing sites when nothing returned", () => {
    expect(shapeGscPortfolioRollup([], P).contributingSites).toBe(0);
    expect(shapeGscPortfolioRollup([], P).hasData).toBe(false);
  });
});

describe("resolveGscDataThrough profile scoping", () => {
  it("uses ONLY the requested profile so a query-scoped window cannot overrun", () => {
    // gsc_perf_class_summary reads dimension_profile='query'. Taking the max
    // across profiles let a fresher `page` import push the window past the last
    // day of query data, biasing every class negative against a settled compare.
    const rows = [
      { dimension_profile: "query", max_date: "2026-07-24" },
      { dimension_profile: "page", max_date: "2026-07-26" },
    ];
    expect(resolveGscDataThrough(rows, ["query"])).toBe("2026-07-24");
    expect(resolveGscDataThrough(rows)).toBe("2026-07-26");
  });
});
