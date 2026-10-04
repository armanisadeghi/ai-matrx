// features/entitlements/coupons/planName.ts
//
// A plan's display name from the one plan catalog (billing.plan_catalog via
// catalog/service — shared, read once). Null when the catalog cannot be read;
// callers then fall back to `planLabel`'s key-derived name.

import { loadPlanCatalog } from "../catalog/service";

export async function catalogPlanName(planKey: string | null): Promise<string | null> {
  if (!planKey) return null;
  try {
    const plans = await loadPlanCatalog();
    return plans.find((p) => p.planKey === planKey)?.name ?? null;
  } catch (err) {
    console.warn("[coupons] plan catalog unreadable; naming the plan from its key.", err);
    return null;
  }
}
