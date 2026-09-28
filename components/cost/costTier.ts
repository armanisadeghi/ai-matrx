/**
 * components/cost/costTier.ts
 *
 * Bucket a POINTS figure for emphasis and warnings (20,000 points = $1):
 *   free       0
 *   low        1–9,999        (< ~$0.50)
 *   moderate   10,000–99,999  (~$0.50–$5)
 *   high       100,000–499,999 (~$5–$25)
 *   very_high  ≥ 500,000      (≥ ~$25)
 * Same dollar thresholds the retired Processing Units tiers used.
 */

export type CostTier = "free" | "low" | "moderate" | "high" | "very_high";

export function costTier(points: number): CostTier {
  if (points <= 0) return "free";
  if (points < 10_000) return "low";
  if (points < 100_000) return "moderate";
  if (points < 500_000) return "high";
  return "very_high";
}

/** True when an action is costly enough to warrant a confirm / sample nudge. */
export function shouldWarnAboutCost(points: number): boolean {
  const t = costTier(points);
  return t === "high" || t === "very_high";
}
