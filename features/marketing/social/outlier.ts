/**
 * THE outlier display standard (UI-SPEC §1.1) — one source for tier
 * thresholds, text and tooltip. Pure: the badge component and every table
 * column read from here, so a threshold change is one edit.
 *
 *   4.2x  — one decimal under 10x, integer from 10x, `99x+` cap
 *   <2x   plain muted text, no fill   · 2–4x neutral · 4–10x accent · ≥10x strong
 *   no baseline → "—" + "Needs 10 posts of history" (never 0x / 1.0x)
 *   young post  → "~4.2x" + "Still gaining views"
 */

import type { OutlierInput } from "./types";

/** Tier thresholds (knob defaults, UI-SPEC §1.1). */
export const OUTLIER_TIER_THRESHOLDS = {
  neutral: 2,
  accent: 4,
  strong: 10,
} as const;

/** Display cap: anything at or above renders `99x+`. */
export const OUTLIER_CAP = 99;
/** Minimum history for a score (knob `outlier_min_posts`). */
export const OUTLIER_MIN_POSTS = 10;
/** A post younger than this is still gaining views (knob `velocity_window_hours`). */
export const OUTLIER_YOUNG_HOURS = 24;

export type OutlierTier = "none" | "plain" | "neutral" | "accent" | "strong";

export interface OutlierBadgeModel {
  tier: OutlierTier;
  /** 0 for plain/none, 1–3 for neutral/accent/strong — the non-color cue. */
  bars: 0 | 1 | 2 | 3;
  text: string;
  tilde: boolean;
  tooltip: string;
}

export function outlierTier(score: number | null): OutlierTier {
  if (score === null || !Number.isFinite(score)) return "none";
  if (score >= OUTLIER_TIER_THRESHOLDS.strong) return "strong";
  if (score >= OUTLIER_TIER_THRESHOLDS.accent) return "accent";
  if (score >= OUTLIER_TIER_THRESHOLDS.neutral) return "neutral";
  return "plain";
}

const TIER_BARS: Record<OutlierTier, 0 | 1 | 2 | 3> = {
  none: 0,
  plain: 0,
  neutral: 1,
  accent: 2,
  strong: 3,
};

/** `4.2x` / `12x` / `99x+`. Never a percentage. */
export function formatMultiplier(score: number): string {
  if (score >= OUTLIER_CAP) return `${OUTLIER_CAP}x+`;
  const oneDecimal = Math.round(score * 10) / 10;
  if (oneDecimal >= 10) return `${Math.round(score)}x`;
  return `${oneDecimal.toFixed(1)}x`;
}

/** 1,234 -> 1.2K; 118,589,135 -> 119M. Null -> em dash (never 0). */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3)}K`;
  return String(Math.round(value));
}

function trim(n: number): string {
  const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return String(rounded);
}

export function outlierBadgeModel(input: OutlierInput): OutlierBadgeModel {
  const { score, baselineViews, percentile, baselineWindow, ageHours } = input;
  if (score === null || !Number.isFinite(score)) {
    return {
      tier: "none",
      bars: 0,
      text: "—",
      tilde: false,
      tooltip: `Needs ${OUTLIER_MIN_POSTS} posts of history`,
    };
  }
  const tier = outlierTier(score);
  const young = ageHours !== null && ageHours < OUTLIER_YOUNG_HOURS;
  const base = baselineViews !== null ? ` (${formatCompact(baselineViews)})` : "";
  const pct =
    percentile !== null && baselineWindow !== null
      ? ` Percentile ${Math.round(percentile)} of last ${baselineWindow}.`
      : percentile !== null
        ? ` Percentile ${Math.round(percentile)}.`
        : "";
  const tooltip = young
    ? "Still gaining views"
    : `${formatMultiplier(score)} this creator's median${base}.${pct}`;
  return {
    tier,
    bars: TIER_BARS[tier],
    text: `${young ? "~" : ""}${formatMultiplier(score)}`,
    tilde: young,
    tooltip,
  };
}

/** `P97`, or an em dash. */
export function formatPercentile(percentile: number | null): string {
  return percentile === null || !Number.isFinite(percentile)
    ? "—"
    : `P${Math.round(percentile)}`;
}
