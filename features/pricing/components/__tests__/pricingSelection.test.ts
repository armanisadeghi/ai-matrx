import { pricingSelectionFromSearch } from "../pricingSelection";
import type { CatalogPlan } from "@/features/entitlements/catalog/types";

const plan = (
  planKey: string,
  audience: CatalogPlan["audience"],
  rank: number,
): CatalogPlan => ({
  planKey,
  name: planKey,
  audience,
  tagline: null,
  rank,
  tier: rank ? "premium" : "free",
  monthlyCents: rank ? 1900 : 0,
  annualCents: rank ? 1500 : 0,
  perSeat: false,
  minSeats: null,
  badge: null,
  isDefault: rank === 0,
  listedOnPricing: true,
  limits: [],
});

const plans = [
  plan("free", "free", 0),
  plan("personal-pro", "personal", 1),
  plan("personal-plus", "personal", 2),
  plan("personal-max", "personal", 3),
  plan("personal-max-plus", "personal", 4),
  plan("team", "company", 5),
];

describe("pricingSelectionFromSearch", () => {
  it("restores an annual ladder choice after sign-in", () => {
    expect(
      pricingSelectionFromSearch(
        plans,
        new URLSearchParams("plan=personal-max-plus&cycle=annual"),
        {
          cycle: "monthly",
          groupId: "personal",
        },
      ),
    ).toEqual({
      cycle: "annual",
      groupId: "personal",
      ladderPick: { "personal-max": "personal-max-plus" },
    });
  });

  it("restores the plan's audience instead of trusting a group URL value", () => {
    expect(
      pricingSelectionFromSearch(
        plans,
        new URLSearchParams("plan=team&cycle=monthly"),
        {
          cycle: "annual",
          groupId: "personal",
        },
      ),
    ).toEqual({ cycle: "monthly", groupId: "business", ladderPick: {} });
  });
});
