import { groupPlansByAudience, planPriceLabel, pointsToUsdLabel, type Plan } from "../types";
import { toAdminUserPlan } from "../../users/lib/accountPlan";

function plan(partial: Partial<Plan> & Pick<Plan, "plan_key" | "audience" | "rank">): Plan {
  return {
    name: partial.plan_key,
    tier: "premium",
    active: true,
    monthly_cents: 0,
    annual_cents: 0,
    per_seat: false,
    is_default: false,
    listed_on_pricing: true,
    tagline: null,
    badge: null,
    min_seats: null,
    ...partial,
  };
}

describe("plan matrix grouping", () => {
  it("orders groups Guest, Free, Personal, Business, Enterprise and plans by rank", () => {
    const groups = groupPlansByAudience([
      plan({ plan_key: "enterprise", audience: "enterprise", rank: 90 }),
      plan({ plan_key: "personal-pro", audience: "personal", rank: 30 }),
      plan({ plan_key: "team", audience: "company", rank: 60 }),
      plan({ plan_key: "personal-entry", audience: "personal", rank: 20 }),
      plan({ plan_key: "guest", audience: "guest", rank: 5 }),
      plan({ plan_key: "free", audience: "free", rank: 10 }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Guest", "Free", "Personal", "Business", "Enterprise"]);
    expect(groups[2].plans.map((p) => p.plan_key)).toEqual(["personal-entry", "personal-pro"]);
  });

  it("keeps an unknown audience instead of dropping its plans", () => {
    const groups = groupPlansByAudience([plan({ plan_key: "x", audience: "partner", rank: 1 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("partner");
  });
});

describe("planPriceLabel", () => {
  it("reads price from the row, never a constant", () => {
    expect(planPriceLabel({ monthly_cents: 1900, per_seat: false })).toBe("$19/mo");
    expect(planPriceLabel({ monthly_cents: 1520, per_seat: false })).toBe("$15.20/mo");
    expect(planPriceLabel({ monthly_cents: 3900, per_seat: true })).toBe("$39/seat/mo");
    expect(planPriceLabel({ monthly_cents: 0, per_seat: false })).toBe("Free");
    expect(planPriceLabel({ monthly_cents: null, per_seat: false })).toBe("Custom");
  });
});

describe("points hint per window", () => {
  it("names the rolling window in words", () => {
    expect(pointsToUsdLabel("20000", "rolling_5h", 20000)).toMatch(/\/ 5-hour of AI$/);
  });
});

describe("toAdminUserPlan", () => {
  it("reads state and the binding window from the database's answer without recomputing", () => {
    const parsed = toAdminUserPlan({
      user_id: "u1",
      plan_key: "personal-pro",
      plan_name: "Pro",
      plan_source: "grant",
      grant_expires_at: null,
      grant_note: null,
      usage: {
        state: "near",
        binding_period: "rolling_5h",
        windows: [
          { period: "month", limit: 320000, used: 1000, resets_at: null, state: "ok" },
          { period: "rolling_5h", limit: 64000, used: 60000, resets_at: "2026-10-04T00:00:00Z", state: "near" },
        ],
      },
    });
    expect(parsed?.state).toBe("near");
    expect(parsed?.source).toBe("grant");
    expect(parsed?.binding).toEqual({
      period: "rolling_5h",
      used: 60000,
      limit: 64000,
      resets_at: "2026-10-04T00:00:00Z",
    });
  });

  it("keeps an unlimited binding window as a null limit", () => {
    const parsed = toAdminUserPlan({
      user_id: "u1",
      plan_key: "enterprise",
      plan_name: "Enterprise",
      plan_source: "default",
      grant_expires_at: null,
      grant_note: null,
      usage: { state: "ok", binding_period: "month", windows: [{ period: "month", limit: null, used: 5 }] },
    });
    expect(parsed?.binding?.limit).toBeNull();
  });
});
