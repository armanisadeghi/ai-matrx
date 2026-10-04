// Every figure a plan screen shows is derived from the billing.plan_catalog()
// row — exact cents, the guest plan never listed, points per window, a null
// price reads Custom. The fixture is shaped like the live RPC payload; the
// numbers in it are test data, not product numbers.

import type { Json } from "@/types/database.types";
import { parsePlanCatalog } from "../parse";
import {
  annualSavingsPercent,
  formatCents,
  planFeatureRows,
  planPrice,
  pointsWindows,
  pricingGroups,
  upgradePlans,
} from "../format";
import { planAction } from "../planAction";

const row = (over: Record<string, Json>): Json => ({
  plan_key: "x",
  name: "X",
  audience: "personal",
  tagline: null,
  rank: 1,
  tier: "premium",
  monthly_cents: 1000,
  annual_cents: 800,
  per_seat: false,
  min_seats: null,
  badge: null,
  is_default: false,
  listed_on_pricing: true,
  limits: [],
  ...over,
});

const PAYLOAD: Json = [
  row({ plan_key: "guest", name: "Guest", audience: "guest", rank: 5, tier: "free", monthly_cents: 0, annual_cents: 0, listed_on_pricing: false }),
  row({ plan_key: "biz", name: "Biz", audience: "company", rank: 60, per_seat: true, min_seats: 3, monthly_cents: 3900, annual_cents: 3120 }),
  row({
    plan_key: "starter",
    name: "Starter",
    rank: 20,
    monthly_cents: 1900,
    annual_cents: 1520,
    limits: [
      { capability: "platform.points", period: "rolling_5h", limit: 24 },
      { capability: "platform.points", period: "month", limit: 120 },
      { capability: "platform.points", period: "week", limit: 36 },
      { capability: "platform.messages", period: "month", limit: 50 },
      { capability: "outreach.send_volume", period: "month", limit: 0 },
      { capability: "seo.provider_spend", period: "month", limit: 9 },
    ],
  }),
  row({ plan_key: "free", name: "Free", audience: "free", rank: 10, tier: "free", monthly_cents: 0, annual_cents: 0, is_default: true }),
  row({ plan_key: "ent", name: "Ent", audience: "enterprise", rank: 90, monthly_cents: null, annual_cents: null }),
  { plan_key: "broken" },
];

describe("plan catalog", () => {
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  afterAll(() => errorSpy.mockRestore());
  const plans = parsePlanCatalog(PAYLOAD);

  it("orders by rank and screams about (drops) an unreadable row", () => {
    expect(plans.map((p) => p.planKey)).toEqual(["guest", "free", "starter", "biz", "ent"]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("refuses a payload that is not a list", () => {
    expect(() => parsePlanCatalog({ nope: true })).toThrow();
  });

  it("prints exact cents, never a rounded price", () => {
    const starter = plans.find((p) => p.planKey === "starter")!;
    expect(formatCents(1520)).toBe("$15.20");
    expect(planPrice(starter, "annual")).toMatchObject({ kind: "paid", value: "$15.20" });
    expect(planPrice(starter, "monthly")).toMatchObject({ kind: "paid", value: "$19" });
    expect(annualSavingsPercent(starter)).toBe(20);
    const biz = plans.find((p) => p.planKey === "biz")!;
    expect(planPrice(biz, "monthly")).toMatchObject({ suffix: "per seat / month" });
    const ent = plans.find((p) => p.planKey === "ent")!;
    expect(planPrice(ent, "annual")).toEqual({ kind: "custom" });
  });

  it("lists points per window, longest first", () => {
    const starter = plans.find((p) => p.planKey === "starter")!;
    expect(pointsWindows(starter).map((w) => [w.label, w.limit])).toEqual([
      ["Month", 120],
      ["Week", 36],
      ["5-hour", 24],
    ]);
  });

  it("shows only labelled non-points limits, a zero limit as not included", () => {
    const starter = plans.find((p) => p.planKey === "starter")!;
    const rows = planFeatureRows(starter);
    expect(rows.map((r) => r.capability)).toEqual(["platform.messages", "outreach.send_volume"]);
    expect(rows[0]).toMatchObject({ value: "50 / month", included: true });
    expect(rows[1]).toMatchObject({ included: false });
  });

  it("never lists the guest plan; groups Personal and Business", () => {
    const groups = pricingGroups(plans);
    expect(groups.map((g) => [g.id, g.plans.map((p) => p.planKey)])).toEqual([
      ["personal", ["free", "starter"]],
      ["business", ["biz", "ent"]],
    ]);
    expect(upgradePlans(plans, "personal").map((p) => p.planKey)).toEqual(["starter"]);
  });

  it("never pretends a checkout exists", () => {
    const by = (k: string) => plans.find((p) => p.planKey === k)!;
    expect(planAction(by("starter"), true).kind).toBe("checkout-pending");
    expect(planAction(by("ent"), false)).toMatchObject({ kind: "contact", href: "/contact" });
    expect(planAction(by("free"), false)).toMatchObject({ kind: "signup" });
    expect(planAction(by("free"), true).kind).toBe("included");
  });
});
