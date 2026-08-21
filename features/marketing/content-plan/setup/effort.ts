/**
 * Effort TIERS for the per-page content pipeline — the FE mirror of aidream's
 * `services/content_plan/effort.py`. Change one and you must change the other.
 *
 * Arman's ruling (canonical: common-docs/systems/marketing/content-planning/FEATURE.md §
 * EFFORT TIERS AND PRE-ESTIMATION): effort is a PATHWAY, not a cap. The cheap
 * tier MERGES steps into fewer calls — the one-shot authoring call IS the
 * cheapest tier and keeps working — the tier is set per SITE with a per-PAGE
 * override, and the whole job's cost is shown BEFORE the button. Nothing here
 * enforces anything mid-run; a started build always finishes.
 *
 * A tier is a preset over the `steps` the fill request has always accepted, so
 * there is one queue and one execution path, never a parallel cheap one.
 *
 * Storage (zero schema, both existing system jsonb):
 * - site default → `web.site.settings.content_plan.effort_tier`
 * - page override → `plan.node.metadata.effort_tier`
 */

import { SITE_SETTINGS_KEY } from "./archetypes";

export type EffortTier = "quick" | "standard" | "thorough" | "advanced";

export const EFFORT_TIERS: readonly EffortTier[] = [
  "quick",
  "standard",
  "thorough",
  "advanced",
];

/** Mirrors `EFFORT_TIER_STEPS` — every tier ends in the build step. */
export const EFFORT_TIER_STEPS: Record<EffortTier, string[]> = {
  quick: ["p6_build"],
  standard: ["p4_write", "p6_build"],
  thorough: ["p3_family", "p4_write", "p6_build"],
  advanced: ["p3_family", "p4_write", "p5_review", "p6_build"],
};

export const EFFORT_TIER_LABEL: Record<EffortTier, string> = {
  quick: "Quick",
  standard: "Standard",
  thorough: "Thorough",
  advanced: "Advanced",
};

export const EFFORT_TIER_BLURB: Record<EffortTier, string> = {
  quick: "One call per page — the page is written straight from its brief.",
  standard: "Content is written as structured text first, then built.",
  thorough: "Adds the family pass so siblings do not cover the same ground.",
  advanced: "Every step, including the review and fact-check pass.",
};

/** What an un-configured site runs — today's whole pipeline, unchanged. */
export const DEFAULT_EFFORT_TIER: EffortTier = "advanced";

export const SITE_EFFORT_KEY = "effort_tier";
export const NODE_EFFORT_KEY = "effort_tier";

/** A stored tier, or null — an unknown value falls back, never throws. */
export function coerceEffortTier(value: unknown): EffortTier | null {
  return typeof value === "string" &&
    (EFFORT_TIERS as readonly string[]).includes(value)
    ? (value as EffortTier)
    : null;
}

/** The site default off `web.site.settings.content_plan.effort_tier`. */
export function readSiteEffortTier(settings: unknown): EffortTier | null {
  if (!settings || typeof settings !== "object") return null;
  const block = (settings as Record<string, unknown>)[SITE_SETTINGS_KEY];
  if (!block || typeof block !== "object") return null;
  return coerceEffortTier((block as Record<string, unknown>)[SITE_EFFORT_KEY]);
}

/** The per-page override off `plan.node.metadata.effort_tier`. */
export function readNodeEffortTier(metadata: unknown): EffortTier | null {
  if (!metadata || typeof metadata !== "object") return null;
  return coerceEffortTier((metadata as Record<string, unknown>)[NODE_EFFORT_KEY]);
}

/** Page override → this run's choice → site default → platform default. */
export function resolveEffortTier(args: {
  nodeMetadata?: unknown;
  requested?: EffortTier | null;
  siteTier?: EffortTier | null;
}): EffortTier {
  return (
    readNodeEffortTier(args.nodeMetadata) ??
    args.requested ??
    args.siteTier ??
    DEFAULT_EFFORT_TIER
  );
}

/** The node metadata jsonb with the page override recorded (null clears it). */
export function withNodeEffortTier(
  metadata: unknown,
  tier: EffortTier | null,
): Record<string, unknown> {
  const next =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (tier) next[NODE_EFFORT_KEY] = tier;
  else delete next[NODE_EFFORT_KEY];
  return next;
}
