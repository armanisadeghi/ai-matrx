import {
  pricingGroups,
  type PricingGroupId,
} from "@/features/entitlements/catalog/format";
import type {
  BillingCycle,
  CatalogPlan,
} from "@/features/entitlements/catalog/types";

/** The visible card slot that contains a plan, including a stepped-up ladder slot. */
export const VISIBLE_PLAN_SLOTS = 4;

export function planSlots(plans: CatalogPlan[]): CatalogPlan[][] {
  if (plans.length <= VISIBLE_PLAN_SLOTS) return plans.map((plan) => [plan]);
  return [
    ...plans.slice(0, VISIBLE_PLAN_SLOTS - 1).map((plan) => [plan]),
    plans.slice(VISIBLE_PLAN_SLOTS - 1),
  ];
}

export interface PricingSelection {
  cycle: BillingCycle;
  groupId: PricingGroupId;
  /** Selected plan per laddered slot, keyed by that slot's first plan. */
  ladderPick: Record<string, string>;
}

/**
 * Reconstruct the exact card a visitor chose before sign-in. The plan key is
 * resolved against the current catalog, so a stale or invented URL cannot
 * select a hidden audience, group, or ladder level.
 */
export function pricingSelectionFromSearch(
  plans: CatalogPlan[],
  search: Pick<URLSearchParams, "get">,
  fallback: Pick<PricingSelection, "cycle" | "groupId">,
): PricingSelection {
  const requestedCycle = search.get("cycle");
  const cycle: BillingCycle =
    requestedCycle === "annual" || requestedCycle === "monthly"
      ? requestedCycle
      : fallback.cycle;
  const groups = pricingGroups(plans);
  const requestedPlan = search.get("plan");
  const group = groups.find((candidate) =>
    candidate.plans.some((plan) => plan.planKey === requestedPlan),
  );
  if (!group || !requestedPlan)
    return { cycle, groupId: fallback.groupId, ladderPick: {} };

  const slot = planSlots(group.plans).find((candidate) =>
    candidate.some((plan) => plan.planKey === requestedPlan),
  );
  return {
    cycle,
    groupId: group.id,
    ladderPick:
      slot && slot.length > 1 ? { [slot[0].planKey]: requestedPlan } : {},
  };
}
