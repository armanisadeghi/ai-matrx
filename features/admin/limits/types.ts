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
  value_type: "number" | "integer" | "boolean" | "string" | "enum";
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
}

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
