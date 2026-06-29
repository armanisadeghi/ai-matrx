/**
 * errorTiers.ts
 *
 * The three-tier VISIBILITY model for captured errors. This is deliberately NOT
 * a logging-severity scale (error / warning / info) — those describe how bad a
 * log line is. A tier describes how LOUD a captured error should be in the UI,
 * and it is something an admin tunes over time by writing downgrade rules
 * (see `errorTierRules.ts`).
 *
 *   red    — Clear Error. Shows the full red badge/pill (like the original
 *            Supabase inspector) and pulses while unseen. The day-1 default for
 *            nearly everything we capture.
 *   orange — Minor. No loud pill; shows only a small dot so an admin knows
 *            something happened, without the alarm. For noise we've decided is
 *            "probably fine, but worth a glance."
 *   yellow — Silent. Nothing visible at all; only listed when the inspector is
 *            opened. For known non-errors we keep for completeness.
 *
 * Everything starts at `red`. The flow is: see it red → tell a coding agent
 * "this shouldn't be an error" → the agent adds a downgrade rule → it drops to
 * orange or yellow. The colors are the contract; the rules are how you tune it.
 */

export type ErrorTier = "red" | "orange" | "yellow";

export interface ErrorTierMeta {
  tier: ErrorTier;
  /** Short human label for chips / filters. */
  label: string;
  /** One line describing the visibility behavior. */
  description: string;
  /**
   * Rank for "the loudest tier present wins" decisions (badge selection,
   * sorting). Higher = louder. red(3) > orange(2) > yellow(1).
   */
  rank: number;
  /** Does this tier produce a visible badge/dot when nothing louder exists? */
  visible: boolean;
  /** Tailwind classes for the tier's accent (chip / dot / left border). */
  dotClass: string;
  chipClass: string;
  accentClass: string;
}

export const ERROR_TIERS: Record<ErrorTier, ErrorTierMeta> = {
  red: {
    tier: "red",
    label: "Clear Error",
    description: "Full red badge; pulses while unseen.",
    rank: 3,
    visible: true,
    dotClass: "bg-destructive",
    chipClass: "bg-destructive/15 text-destructive border-destructive/30",
    accentClass: "border-l-destructive",
  },
  orange: {
    tier: "orange",
    label: "Minor",
    description: "Small dot only — noticed, not alarming.",
    rank: 2,
    visible: true,
    dotClass: "bg-amber-500",
    chipClass:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    accentClass: "border-l-amber-500",
  },
  yellow: {
    tier: "yellow",
    label: "Silent",
    description: "Hidden until the inspector is opened.",
    rank: 1,
    visible: false,
    dotClass: "bg-yellow-400",
    chipClass:
      "bg-yellow-400/15 text-yellow-600 dark:text-yellow-500 border-yellow-400/30",
    accentClass: "border-l-yellow-400/70",
  },
};

/** Day-1 default — nearly everything captured is a clear error until tuned. */
export const DEFAULT_TIER: ErrorTier = "red";

/** Tiers ordered loudest-first, for filters and badge logic. */
export const TIERS_BY_RANK: ErrorTier[] = ["red", "orange", "yellow"];

export function tierMeta(tier: ErrorTier): ErrorTierMeta {
  return ERROR_TIERS[tier] ?? ERROR_TIERS.red;
}

/** The loudest tier in a set (e.g. to pick what the badge shows). */
export function loudestTier(tiers: ErrorTier[]): ErrorTier | null {
  let best: ErrorTier | null = null;
  for (const t of tiers) {
    if (!best || tierMeta(t).rank > tierMeta(best).rank) best = t;
  }
  return best;
}
