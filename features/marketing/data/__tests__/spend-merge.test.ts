/**
 * All organizations = the person's organizations' SEO spend summaries merged into one (never the
 * active organization). The forcing output is the merged rollup: costs and runs add, each
 * provider's ceiling adds, % used is recomputed from the sums, the daily series merges by date.
 */
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [], loading: false }),
}));

import { mergeSeoSpendSummaries, type SeoSpendSummary } from "../spend";

function summary(orgId: string, cost: number, ceiling: number, day: string): SeoSpendSummary {
  const row = {
    provider: "dataforseo",
    reported_cost: cost,
    estimated_cost: 0,
    effective_cost: cost,
    unpriced_runs: 0,
    billable_cost: cost,
    run_count: 2,
    ceiling_usd: ceiling,
    pct_used: (cost / ceiling) * 100,
  };
  return {
    organization_id: orgId,
    generated_at: "2026-09-30T00:00:00Z",
    this_month: [row],
    last_month: [],
    daily_series: [
      { date: day, effective_cost: cost, unpriced_runs: 0, billable_cost: cost, run_count: 2 },
    ],
    org_provider_monthly_ceiling_usd: ceiling,
    global_provider_monthly_ceiling_usd: 1000,
    unpriced_run_assumed_cost_usd: 1,
    recent_budget_rejections: [],
    social_this_month_usd: 2,
    social_this_month_calls: 5,
  } as SeoSpendSummary;
}

describe("mergeSeoSpendSummaries", () => {
  it("adds costs, runs and ceilings across organizations and recomputes % used", () => {
    const merged = mergeSeoSpendSummaries(
      [summary("a", 10, 100, "2026-09-29"), summary("b", 30, 100, "2026-09-29")],
      ["c"],
    );
    expect(merged.organizationCount).toBe(2);
    expect(merged.social_this_month_usd).toBe(4);
    expect(merged.social_this_month_calls).toBe(10);
    expect(merged.unreadOrganizationIds).toEqual(["c"]);
    expect(merged.this_month).toHaveLength(1);
    expect(merged.this_month[0].effective_cost).toBe(40);
    expect(merged.this_month[0].run_count).toBe(4);
    expect(merged.this_month[0].ceiling_usd).toBe(200);
    expect(merged.this_month[0].pct_used).toBeCloseTo(20);
    expect(merged.daily_series).toEqual([
      expect.objectContaining({ date: "2026-09-29", effective_cost: 40, run_count: 4 }),
    ]);
  });

  it("a single organization passes through with its own id", () => {
    const merged = mergeSeoSpendSummaries([summary("a", 10, 100, "2026-09-29")]);
    expect(merged.organization_id).toBe("a");
    expect(merged.this_month[0].pct_used).toBeCloseTo(10);
  });
});
