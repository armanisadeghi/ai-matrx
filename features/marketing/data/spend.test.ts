import { readSeoSpendSummary } from "./spend";

const RESPONSE = {
  organization_id: "org-1",
  generated_at: "2026-08-20T00:00:00Z",
  this_month: [
    {
      provider: "dataforseo",
      reported_cost: "1.2500",
      estimated_cost: "0.0000",
      effective_cost: "1.2500",
      unpriced_runs: 0,
      billable_cost: "1.2500",
      run_count: 2,
      ceiling_usd: "50.0000",
      pct_used: "2.5000",
    },
  ],
  last_month: [],
  daily_series: [
    {
      date: "2026-08-20",
      effective_cost: "1.2500",
      unpriced_runs: 0,
      billable_cost: "1.2500",
      run_count: 2,
    },
  ],
  org_provider_monthly_ceiling_usd: "50.0000",
  global_provider_monthly_ceiling_usd: "1000.0000",
  unpriced_run_assumed_cost_usd: "0.0100",
  recent_budget_rejections: [
    {
      run_id: "run-1",
      provider: "dataforseo",
      occurred_at: "2026-08-20T00:00:00Z",
      ceiling: "organization_provider_monthly",
      limit_usd: "50.0000",
      spent_usd: "49.0000",
      projected_usd: "51.0000",
    },
  ],
};

describe("readSeoSpendSummary", () => {
  it("converts OpenAPI Decimal strings into finite presentation numbers", () => {
    const result = readSeoSpendSummary(RESPONSE);

    expect(result.this_month[0]?.pct_used).toBe(2.5);
    expect(result.daily_series[0]?.effective_cost).toBe(1.25);
    expect(result.recent_budget_rejections[0]?.projected_usd).toBe(51);
  });

  it("rejects malformed decimals instead of passing them to renderers", () => {
    expect(() =>
      readSeoSpendSummary({
        ...RESPONSE,
        this_month: [{ ...RESPONSE.this_month[0], pct_used: "not-a-number" }],
      }),
    ).toThrow("invalid percentage used");
  });
});
