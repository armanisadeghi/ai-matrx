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
    /** One line describing the display behavior. */
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
export declare const ERROR_TIERS: Record<ErrorTier, ErrorTierMeta>;
/** Day-1 default — nearly everything captured is a clear error until tuned. */
export declare const DEFAULT_TIER: ErrorTier;
/** Tiers ordered loudest-first, for filters and badge logic. */
export declare const TIERS_BY_RANK: ErrorTier[];
export declare function tierMeta(tier: ErrorTier): ErrorTierMeta;
/** The loudest tier in a set (e.g. to pick what the badge shows). */
export declare function loudestTier(tiers: ErrorTier[]): ErrorTier | null;
