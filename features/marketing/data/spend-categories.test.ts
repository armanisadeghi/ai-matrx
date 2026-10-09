import { groupSpendByCategory, spendCategory } from "./spend-categories";
import type { SeoProviderSpendRow } from "./spend";

const row = (provider: string, cost: number, runs = 1): SeoProviderSpendRow => ({
  provider,
  reported_cost: cost,
  estimated_cost: 0,
  effective_cost: cost,
  unpriced_runs: 0,
  billable_cost: cost,
  run_count: runs,
  ceiling_usd: 100,
  pct_used: cost,
});

describe("spend categories", () => {
  it("names activities, never vendors", () => {
    expect(spendCategory("DataForSEO")).toBe("SEO data");
    expect(spendCategory("serpapi")).toBe("Web search");
    expect(spendCategory("brave")).toBe("Web search");
    expect(spendCategory("aidream")).toBe("AI");
    expect(spendCategory("gsc")).toBe("Search performance");
    expect(spendCategory("brand-new-vendor")).toBe("Other data");
  });

  it("merges vendors of one category, adds social, drops empties, sorts by cost", () => {
    const out = groupSpendByCategory(
      [row("brave", 1, 2), row("serpapi", 2, 3), row("dataforseo", 10), row("gsc", 0, 0)],
      { usd: 4, calls: 7 },
    );
    expect(out.map((r) => [r.category, r.usd, r.runs])).toEqual([
      ["SEO data", 10, 1],
      ["Social data", 4, 7],
      ["Web search", 3, 5],
    ]);
    const text = JSON.stringify(out).toLowerCase();
    for (const vendor of ["dataforseo", "brave", "serpapi", "aidream", "gsc", "scrapecreators"]) {
      expect(text).not.toContain(vendor);
    }
  });

  it("shows no social line when the server sent none", () => {
    expect(groupSpendByCategory([row("brave", 1)], null).map((r) => r.category)).toEqual(["Web search"]);
    expect(groupSpendByCategory([], { usd: null, calls: null })).toEqual([]);
  });
});
