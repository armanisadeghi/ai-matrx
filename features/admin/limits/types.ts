// Limits & Knobs — the shapes the admin surface reads and writes.
//
// Authority: common-docs/policies/limits-are-knobs-agents-set-them.md (Arman,
// 2026-08-20). Every limit on this platform is a row an admin can change, not a
// constant in a source file. This surface is the "can Arman change it without a
// deploy" half of that rule — without it the rows are just a nicer place to
// hardcode.

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
  id: string;
  name: string;
  audience: string;
  rank: number;
  tier: string;
  active: boolean;
}

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
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
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
export const POINTS_PER_USD = 20_000;

export function isPoints(capability: string): boolean {
  return capability === POINTS_CAPABILITY;
}

/**
 * "~$16.00 / month of AI" for a points figure, or `null` when there is nothing
 * honest to say (blank, not a number, or not the points capability). A blank
 * is unlimited and gets no dollar figure — "~$∞" is not a sentence.
 */
export function pointsToUsdLabel(
  points: number | string | null | undefined,
  period: string | null | undefined,
): string | null {
  if (points === null || points === undefined) return null;
  const numeric = typeof points === "string" ? Number(points.trim()) : points;
  if (typeof points === "string" && points.trim() === "") return null;
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const usd = numeric / POINTS_PER_USD;
  const money = usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const per = period && period !== "lifetime" ? ` / ${period}` : "";
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
export function limitToHuman(capability: string, stored: number | null): string {
  if (stored === null || stored === undefined) return "unlimited";
  if (isMicroUsd(capability)) {
    return (stored / MICRO_USD_PER_USD).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
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
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
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
