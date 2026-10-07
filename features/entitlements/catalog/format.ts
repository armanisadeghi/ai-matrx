// features/entitlements/catalog/format.ts
//
// How a catalog plan reads on screen. Every figure is DERIVED from the plan
// row — price from exact cents, the annual saving from the two prices, points
// and limits from `limits`. Nothing here is a number about a plan.

import { formatCount, formatFileSize, formatMoney } from "@ai-matrx/kit/format";
import { CAPABILITY_REGISTRY, isCapability } from "../registry";
import type { BillingCycle, CatalogPlan, PlanAudience, PlanLimitPeriod } from "./types";

/** The capability that carries a plan's AI points allowance. */
export const POINTS_CAPABILITY = "platform.points";

/** Plans carry no currency column; every billing.plan price is in US cents. */
export function formatCents(cents: number): string {
  return formatMoney(cents, { currency: "USD", unit: "minor", digits: "whole" });
}

export type PlanPrice =
  | { kind: "custom" }
  | { kind: "free" }
  | { kind: "paid"; cents: number; value: string; suffix: string };

export function planPrice(plan: CatalogPlan, cycle: BillingCycle): PlanPrice {
  const cents = cycle === "annual" ? plan.annualCents : plan.monthlyCents;
  if (cents == null) return { kind: "custom" };
  if (cents === 0) return { kind: "free" };
  return {
    kind: "paid",
    cents,
    value: formatCents(cents),
    suffix: plan.perSeat ? "per seat / month" : "per month",
  };
}

/** Whole-percent saving of annual over monthly billing, or `null` when there is none. */
export function annualSavingsPercent(plan: CatalogPlan): number | null {
  const { monthlyCents: m, annualCents: a } = plan;
  if (m == null || a == null || m <= 0 || a >= m) return null;
  return Math.round((1 - a / m) * 100);
}

/** The largest annual saving across plans — what a billing toggle may promise. */
export function maxAnnualSavingsPercent(plans: CatalogPlan[]): number | null {
  let best: number | null = null;
  for (const plan of plans) {
    const pct = annualSavingsPercent(plan);
    if (pct != null && (best == null || pct > best)) best = pct;
  }
  return best;
}

const WINDOW_LABEL: Record<PlanLimitPeriod, string> = {
  rolling_1h: "Hour",
  rolling_5h: "5-hour",
  day: "Day",
  week: "Week",
  month: "Month",
  lifetime: "Total",
};
const WINDOW_ORDER: PlanLimitPeriod[] = ["month", "week", "day", "rolling_5h", "rolling_1h", "lifetime"];

export interface PointsWindow {
  period: PlanLimitPeriod;
  label: string;
  /** `null` = unlimited (never Enterprise: custom per organization). */
  limit: number | null;
}

/** The plan's AI points allowance per window, longest window first. */
export function pointsWindows(plan: CatalogPlan): PointsWindow[] {
  return plan.limits
    .filter((l) => l.capability === POINTS_CAPABILITY)
    .sort((a, b) => WINDOW_ORDER.indexOf(a.period) - WINDOW_ORDER.indexOf(b.period))
    .map((l) => ({ period: l.period, label: WINDOW_LABEL[l.period], limit: l.limit }));
}

export function formatPoints(points: number): string {
  return points.toLocaleString("en-US");
}

const PERIOD_SUFFIX: Record<PlanLimitPeriod, string> = {
  rolling_1h: " / hour",
  rolling_5h: " / 5 hours",
  day: " / day",
  week: " / week",
  month: " / month",
  lifetime: "",
};

export interface PlanFeatureRow {
  capability: string;
  label: string;
  value: string;
  /** False when the plan's limit is 0 — the capability is not included. */
  included: boolean;
}

/**
 * Every non-points limit of the plan that has a registered label, as display
 * rows. A capability with no registry entry has no human words yet, so it is
 * left out rather than shown by its raw key.
 */
export function planFeatureRows(plan: CatalogPlan): PlanFeatureRow[] {
  const rows: PlanFeatureRow[] = [];
  for (const l of plan.limits) {
    if (l.capability === POINTS_CAPABILITY || !isCapability(l.capability)) continue;
    const label = CAPABILITY_REGISTRY[l.capability].label;
    let value: string;
    if (l.limit == null) value = "Unlimited";
    else if (l.capability.endsWith("_bytes")) value = formatFileSize(l.limit);
    else value = `${formatCount(l.limit, { locale: "en-US" })}${PERIOD_SUFFIX[l.period]}`;
    rows.push({ capability: l.capability, label, value, included: l.limit !== 0 });
  }
  return rows;
}

export type PricingGroupId = "personal" | "business";

export interface PricingGroup {
  id: PricingGroupId;
  label: string;
  plans: CatalogPlan[];
}

const GROUP_OF: Record<PlanAudience, PricingGroupId | null> = {
  guest: null,
  free: "personal",
  personal: "personal",
  company: "business",
  enterprise: "business",
};
const GROUP_LABEL: Record<PricingGroupId, string> = {
  personal: "Personal",
  business: "Business",
};

/** Listed plans grouped for the pricing page: Free + Personal, then Business + Enterprise. */
export function pricingGroups(plans: CatalogPlan[]): PricingGroup[] {
  const groups: PricingGroup[] = (["personal", "business"] as const).map((id) => ({
    id,
    label: GROUP_LABEL[id],
    plans: [],
  }));
  for (const plan of plans) {
    if (!plan.listedOnPricing) continue;
    const id = GROUP_OF[plan.audience];
    if (id) groups.find((g) => g.id === id)?.plans.push(plan);
  }
  return groups.filter((g) => g.plans.length > 0);
}

/** Paid, listed plans of one audience family — what an upgrade picker offers. */
export function upgradePlans(plans: CatalogPlan[], group: PricingGroupId): CatalogPlan[] {
  return plans.filter(
    (p) =>
      p.listedOnPricing &&
      GROUP_OF[p.audience] === group &&
      p.audience !== "free" &&
      p.monthlyCents != null &&
      p.monthlyCents > 0,
  );
}

/**
 * The name to say for a tier: the first plan (by rank) that a person can buy
 * at that tier — the default plan for `free`. `null` when no plan carries it.
 * Tiers are an entitlement level; people only ever see plan names.
 */
export function tierPlanName(plans: CatalogPlan[], tier: CatalogPlan["tier"]): string | null {
  if (tier === "free") return defaultPlan(plans)?.name ?? plans.find((p) => p.audience === "free")?.name ?? null;
  const plan = plans
    .filter((p) => p.tier === tier && p.listedOnPricing && p.audience !== "guest")
    .sort((a, b) => a.rank - b.rank)[0];
  return plan?.name ?? null;
}

/** The plan a person with no subscription is on (`is_default`). */
export function defaultPlan(plans: CatalogPlan[]): CatalogPlan | null {
  return plans.find((p) => p.isDefault) ?? null;
}

export function seatNote(plan: CatalogPlan): string | null {
  return plan.minSeats != null && plan.minSeats > 1 ? `${plan.minSeats} seat minimum` : null;
}
