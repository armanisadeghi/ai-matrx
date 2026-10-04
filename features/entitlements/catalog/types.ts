// features/entitlements/catalog/types.ts
//
// The shape of `billing.plan_catalog()` — the ONE public read of every plan a
// person can be on, with its prices and limits. Every screen that names a plan,
// a price, a points allowance or a limit renders from this. There is no plan
// name, price or number anywhere in this folder: they are `billing.plan` /
// `billing.plan_limit` rows (USAGE-GATE.md rule 13).

import type { EntitlementTier } from "../types";

export type PlanAudience = "guest" | "free" | "personal" | "company" | "enterprise";

export type PlanLimitPeriod =
  | "day"
  | "week"
  | "month"
  | "lifetime"
  | "rolling_1h"
  | "rolling_5h";

export interface CatalogLimit {
  capability: string;
  period: PlanLimitPeriod;
  /** `null` = unlimited, or custom (enterprise). */
  limit: number | null;
}

export interface CatalogPlan {
  /** The plan slug ('personal-pro', 'free', …) — what checkout and plan assignment take. */
  planKey: string;
  name: string;
  audience: PlanAudience;
  tagline: string | null;
  rank: number;
  tier: EntitlementTier;
  /** Exact cents. `null` = custom pricing (quote). */
  monthlyCents: number | null;
  /** Exact cents per month when billed annually. `null` = custom pricing. */
  annualCents: number | null;
  perSeat: boolean;
  minSeats: number | null;
  badge: string | null;
  isDefault: boolean;
  listedOnPricing: boolean;
  limits: CatalogLimit[];
}

export type BillingCycle = "monthly" | "annual";
