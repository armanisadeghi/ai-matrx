// Limits & Knobs — the shapes the admin surface reads and writes.
//
// Authority: common-docs/policies/limits-are-knobs-agents-set-them.md (Arman,
// 2026-08-20). Every limit on this platform is a row an admin can change, not a
// constant in a source file. This surface is the "can Arman change it without a
// deploy" half of that rule — without it the rows are just a nicer place to
// hardcode.

import { formatMoney, pointsToUsd } from "@ai-matrx/kit/format";
import { formatAdminCost } from "@/components/cost/formatAdminCost";

/** One operational knob: a ceiling, backstop, cadence or default. */
export interface FeatureKnob {
  feature: string;
  key: string;
  value: unknown;
  default_value: unknown;
  value_type: "number" | "integer" | "boolean" | "string" | "enum" | "json";
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  allowed_values: string[] | null;
  label: string;
  description: string;
  /** `agent` = still the provisional value an agent chose under blind approval. */
  set_by: "agent" | "human";
  basis: string | null;
  review_due: string | null;
  /** Scope kinds permitted to override this knob; `[]` = platform-locked. */
  overridable_by: string[];
  override_direction: "any" | "lower_only" | "raise_only";
  /** Statutory floor an override may never cross, distinct from the default. */
  bound_value: unknown;
  /** Presentation and filing metadata are part of the registry, not a second settings map. */
  ui: unknown;
  taxonomy_node_id: string | null;
  propagation: "next_load" | "instant";
}

/** `feature_knob_set` deliberately returns refusals in-band so callers can explain them. */
export type FeatureKnobSetResult =
  | { ok: true; feature?: string; key?: string }
  | { ok: false; reason: string; detail?: string; feature?: string; key?: string };

/** One plan's allowance for one metered capability. */
export interface PlanLimit {
  plan_id: string;
  capability: string;
  period: string;
  /** `null` is UNLIMITED, and is never the same thing as `0`. */
  limit_value: number | null;
  note: string | null;
}

export interface Plan {
  /** `billing.plan.plan_key` — the slug `plan_limit.plan_id` and `plan_limit_set` use (DD-173). */
  plan_key: string;
  name: string;
  audience: string;
  rank: number;
  tier: string;
  active: boolean;
  /** List price per month in cents; `null` = priced by contract (enterprise). */
  monthly_cents: number | null;
  /** Per-month price when billed yearly, in cents. */
  annual_cents: number | null;
  per_seat: boolean;
  is_default: boolean;
  listed_on_pricing: boolean;
  tagline: string | null;
  badge: string | null;
  min_seats: number | null;
}

/** The `billing.plan` columns `billing.plan_set` writes — the plan editor's fields. */
export type PlanFields = Partial<
  Pick<
    Plan,
    | "name"
    | "tagline"
    | "badge"
    | "monthly_cents"
    | "annual_cents"
    | "per_seat"
    | "min_seats"
    | "listed_on_pricing"
    | "rank"
    | "active"
  >
>;

/**
 * The audience groups the plan matrix and the plan pickers render, in order.
 * `billing.plan.audience` is the key; `company` reads "Business" (Arman,
 * 2026-10-03: plans are grouped Personal and Business, plus Free, Guest and
 * Enterprise). An audience not listed here still renders, under its own key.
 */
export const PLAN_AUDIENCE_GROUPS: ReadonlyArray<{ audience: string; label: string }> = [
  { audience: "guest", label: "Guest" },
  { audience: "free", label: "Free" },
  { audience: "personal", label: "Personal" },
  { audience: "company", label: "Business" },
  { audience: "enterprise", label: "Enterprise" },
];

export function audienceLabel(audience: string): string {
  return PLAN_AUDIENCE_GROUPS.find((g) => g.audience === audience)?.label ?? audience;
}

/** Plans grouped by audience (group order above, then `rank`). */
export function groupPlansByAudience(plans: Plan[]): Array<{ audience: string; label: string; plans: Plan[] }> {
  const known = PLAN_AUDIENCE_GROUPS.map((g) => g.audience);
  const extra = [...new Set(plans.map((p) => p.audience))].filter((a) => !known.includes(a));
  return [...known, ...extra]
    .map((audience) => ({
      audience,
      label: audienceLabel(audience),
      plans: plans.filter((p) => p.audience === audience).sort((a, b) => a.rank - b.rank),
    }))
    .filter((group) => group.plans.length > 0);
}

/** "$19/mo", "$39/seat/mo", "Free", "Custom" — read-only price label from `billing.plan`. */
export function planPriceLabel(plan: Pick<Plan, "monthly_cents" | "per_seat">): string {
  if (plan.monthly_cents === null) return "Custom";
  if (plan.monthly_cents === 0) return "Free";
  const money = formatMoney(plan.monthly_cents, { currency: "USD", unit: "minor", digits: "whole" });
  return `${money}${plan.per_seat ? "/seat" : ""}/mo`;
}

/** Every `billing.meter_period`, in the order the matrix shows windows. */
export const METER_PERIODS = ["month", "week", "day", "rolling_5h", "rolling_1h", "lifetime"] as const;
export type MeterPeriodKey = (typeof METER_PERIODS)[number];

export const PERIOD_LABEL: Record<string, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  rolling_5h: "5-hour",
  rolling_1h: "1-hour",
  lifetime: "Total",
};

export function periodLabel(period: string): string {
  return PERIOD_LABEL[period] ?? period;
}

/** AI-points windows shown by default; Day and 1-hour are a column toggle away. */
export const DEFAULT_POINTS_WINDOWS: readonly string[] = ["month", "week", "rolling_5h"];
export const OPTIONAL_POINTS_WINDOWS: readonly string[] = ["day", "rolling_1h"];

export interface Capability {
  capability: string;
  enforced: boolean;
  period: string | null;
  min_tier: string;
  usage_source: string;
}

/**
 * Capabilities whose `limit_value` is denominated in micro-dollars
 * (1 USD = 1,000,000), so the admin edits dollars and never counts zeroes.
 *
 * `billing.capability_limit.limit_value` is an integer, so a money dimension
 * has to be whole units of something; provider costs run to fractions of a cent
 * (a 1,000-row competitor link-gap pull is $0.06), which cents would round away.
 */
export const MICRO_USD_CAPABILITIES = new Set(["seo.provider_spend"]);
export const MICRO_USD_PER_USD = 1_000_000;

export function isMicroUsd(capability: string): boolean {
  return MICRO_USD_CAPABILITIES.has(capability);
}

/**
 * Stored integer → what the admin sees. Blank stays blank.
 *
 * 🚨 `null` is UNLIMITED and is NOT the same fact as `0`, which means the plan
 * does not include the capability at all. Collapsing the two is how a plan
 * silently loses a capability, so they never share a rendering.
 */
export function limitToDisplay(capability: string, stored: number | null): string {
  if (stored === null || stored === undefined) return "";
  return isMicroUsd(capability)
    ? String(stored / MICRO_USD_PER_USD)
    : String(stored);
}

/**
 * What the admin typed → the stored integer.
 *
 * Blank means unlimited (`null`). `undefined` means "that is not a number I can
 * store" — the caller must refuse rather than guess, because every wrong guess
 * here changes what a customer is allowed to do.
 */
export function limitToStored(
  capability: string,
  raw: string,
): number | null | undefined {
  const trimmed = raw.trim();
  // Blank or the word "unlimited" both store NULL; the word is how a window
  // with no row yet is created unlimited (blank over no row writes nothing).
  if (trimmed === "" || /^unlimited$/i.test(trimmed)) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return isMicroUsd(capability)
    ? Math.round(parsed * MICRO_USD_PER_USD)
    : Math.round(parsed);
}

/**
 * `platform.points` — the AI budget. 20,000 points = $1 of model spend, so
 * `personal-pro` at 320,000 points/month is ~$16 of AI. The admin still types
 * POINTS (the stored unit never changes); this is only the dollar hint that
 * sits beside the number so nobody has to divide by twenty thousand in their
 * head.
 *
 * 🚨 The server mirror is `aidream/services/billing/ai_points.py` — the two
 * MUST agree. A drift here would show an admin one dollar figure and bank the
 * customer against another.
 *
 * Not a money dimension in the `MICRO_USD_CAPABILITIES` sense: points are the
 * stored unit, dollars are commentary. `seo.provider_spend` is the reverse.
 */
export const POINTS_CAPABILITY = "platform.points";

export function isPoints(capability: string): boolean {
  return capability === POINTS_CAPABILITY;
}

/**
 * "~1,234 points / month of AI" (or "~$16.00 / month of AI" for a system
 * admin who flipped to dollars) for a points figure, or `null` when there is
 * nothing honest to say (blank, not a number, or not the points capability).
 * A blank is unlimited and gets no figure — "~∞" is not a sentence.
 *
 * This is the ONE place in this file allowed to render money at all: it is
 * the admin limits editor describing a POINTS limit back to the admin, not a
 * cost charged to anyone, so it renders through `formatCost` with the
 * viewer's own unit (`useCostDisplay().unit`) rather than a bare dollar
 * string — everyone else still sees points by default.
 */
export function pointsToUsdLabel(
  points: number | string | null | undefined,
  period: string | null | undefined,
  /** The SUBSCRIBED points rate (`usePointsRate()`), never a one-shot read in render. */
  rate: number | null,
): string | null {
  if (points === null || points === undefined) return null;
  const numeric = typeof points === "string" ? Number(points.trim()) : points;
  if (typeof points === "string" && points.trim() === "") return null;
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const money = formatAdminCost(pointsToUsd(numeric, { rate }), { rate });
  const per = period && period !== "lifetime" ? ` / ${periodLabel(period).toLowerCase()}` : "";
  return `~${money}${per} of AI`;
}

/** The human unit an admin types for a capability, as a short suffix label. */
export function capabilityUnitLabel(capability: string): string {
  if (isMicroUsd(capability)) return "US dollars";
  if (isPoints(capability)) return "points";
  return "units";
}

/**
 * The saved number, in the human unit, with thousands separators — the
 * READ rendering (the edit rendering is `limitToDisplay`, which stays a bare
 * string so it can round-trip through an input). Blank is unlimited.
 */
export function limitToHuman(
  capability: string,
  stored: number | null,
  /** The SUBSCRIBED points rate (`usePointsRate()`), never a one-shot read in render. */
  rate: number | null,
): string {
  if (stored === null || stored === undefined) return "unlimited";
  if (isMicroUsd(capability)) {
    return formatAdminCost(stored / MICRO_USD_PER_USD, { rate });
  }
  return stored.toLocaleString("en-US");
}

/** One per-org grant that RAISES a plan's allowance. It never lowers one. */
export interface AccountAddon {
  id: string;
  organization_id: string;
  capability: string;
  period: string | null;
  /** `null` is UNLIMITED — the add-on lifts the ceiling entirely. */
  limit_value: number | null;
  source: string;
  note: string | null;
  granted_by: string | null;
  effective_from: string;
  expires_at: string | null;
  created_at: string;
}

/** The org rows the picker needs — name and slug, never the whole record. */
export interface OrganizationOption {
  /** Set when the organization is archived (closed, not deleted). */
  archived_at?: string | null;
  id: string;
  name: string;
  slug: string;
}

/** One org's current plan assignment (`billing.org_plan`, via `org_plan_list`). */
export interface OrgPlanAssignment {
  organization_id: string;
  plan_id: string | null;
  tier: string;
}

/**
 * "In effect" is a fact about NOW, computed the same way the resolver does:
 * started already, and not yet expired. An expired row still exists — it is
 * shown as expired, never dropped.
 */
export function addonIsInEffect(
  addon: Pick<AccountAddon, "effective_from" | "expires_at">,
  now: Date = new Date(),
): boolean {
  const start = new Date(addon.effective_from).getTime();
  if (start > now.getTime()) return false;
  if (addon.expires_at === null) return true;
  return new Date(addon.expires_at).getTime() > now.getTime();
}
