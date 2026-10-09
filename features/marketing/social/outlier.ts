/**
 * THE outlier display standard (UI-SPEC §1.1) — one source for tier
 * thresholds, text and tooltip. Pure: the badge component and every table
 * column read from here, so a threshold change is one edit.
 *
 *   4.2x  — one decimal under 10x, integer from 10x, `99x+` cap
 *   <2x   plain muted text, no fill   · 2–4x neutral · 4–10x accent · ≥10x strong
 *   no baseline → the REASON, never 0x / 1.0x:
 *     post has no view count → "No views"   · account has 0 posts → "No posts"
 *     too few posts          → "11+ posts" + "Needs 10 other posts to compare"
 *   young post  → "~4.2x" + "~ means provisional: still gaining views, so 4.2x will move."
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
/** Minimum OTHER posts for a score (knob `outlier_min_posts`): a profile needs 11 posts before any post has a multiple. */
export const OUTLIER_MIN_POSTS = 10;
/** How many of a profile's latest posts make its baseline (knob `outlier_baseline_posts`). */
export const OUTLIER_BASELINE_POSTS = 30;
/** A post younger than this is still gaining views (knob `velocity_window_hours`). */
export const OUTLIER_YOUNG_HOURS = 24;

/** The visible no-baseline state (UI-SPEC §1.1): a profile needs OUTLIER_MIN_POSTS + 1 posts. */
export const NO_BASELINE_TEXT = `${OUTLIER_MIN_POSTS + 1}+ posts`;

export const NO_VIEWS_TEXT = "No views";
export const NO_POSTS_TEXT = "No posts";

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
    if (input.noViews) {
      return { tier: "none", bars: 0, text: NO_VIEWS_TEXT, tilde: false, tooltip: "This post reports no view count, so there is no multiple" };
    }
    if (input.accountPosts === 0) {
      return { tier: "none", bars: 0, text: NO_POSTS_TEXT, tilde: false, tooltip: "This account has no posts yet" };
    }
    return {
      tier: "none",
      bars: 0,
      text: NO_BASELINE_TEXT,
      tilde: false,
      tooltip: `Needs ${OUTLIER_MIN_POSTS} other posts to compare`,
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
    ? `~ means provisional: still gaining views, so ${formatMultiplier(score)} will move.`
    : `${formatMultiplier(score)} this creator's median${base}.${pct}`;
  return {
    tier,
    bars: TIER_BARS[tier],
    text: `${young ? "~" : ""}${formatMultiplier(score)}`,
    tilde: young,
    tooltip,
  };
}

/** `2.4× usual views` — the sentence form of a multiple, for the post panel (the badge keeps `2.4x`). */
export function formatMultiplierLong(score: number): string {
  return `${formatMultiplier(score).replace(/x(\+?)$/, "×$1")} usual views`;
}

/** The percentile and median in words, for the tooltip next to a multiple. */
export function explainOutlier(input: Pick<OutlierInput, "score" | "baselineViews" | "percentile" | "baselineWindow">): string {
  const parts: string[] = [];
  if (input.percentile !== null && Number.isFinite(input.percentile)) {
    const pct = Math.round(input.percentile);
    const of = input.baselineWindow ? `this creator's last ${input.baselineWindow} posts` : "this creator's other posts";
    parts.push(`Gets more views than ${pct}% of ${of}.`);
  }
  if (input.baselineViews !== null && Number.isFinite(input.baselineViews)) {
    parts.push(`A usual post from them gets about ${formatCompact(input.baselineViews)} views.`);
  }
  return parts.join(" ");
}

/** `1 like` / `2.4K likes`; null when there is no count (the stat is then hidden, never a dash). */
export function countLabel(value: number | null | undefined, singular: string, plural = `${singular}s`): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${formatCompact(value)} ${Math.round(value) === 1 ? singular : plural}`;
}

/** `P97`, or an em dash. */
export function formatPercentile(percentile: number | null): string {
  return percentile === null || !Number.isFinite(percentile)
    ? "—"
    : `P${Math.round(percentile)}`;
}

// ---------------------------------------------------------------------------
// THE baseline (the only place a creator's median / engagement is computed)
// ---------------------------------------------------------------------------

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface BaselinePostInput {
  postedAt: string | null;
  views: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
}

export interface ProfileBaseline {
  /** Median views of the latest `window` posts that report views; null with none. */
  medianViews: number | null;
  /** (likes + comments + shares) / views over the same posts; null with no views. */
  engagementRate: number | null;
  /** How many posts the numbers rest on. */
  posts: number;
}

/**
 * A profile's baseline: its latest `window` posts (newest first, undated last)
 * that report views. Account page, Accounts table and the KPI benchmark all
 * read this and nothing else, so the same creator never shows two medians.
 * Mirrors the server's per-post rule (`aidream/services/social/stats.py`),
 * which excludes the post being scored; a profile-level figure has no such post.
 */
export function profileBaseline(
  posts: readonly BaselinePostInput[],
  window: number = OUTLIER_BASELINE_POSTS,
): ProfileBaseline {
  const at = (p: BaselinePostInput): number => {
    const t = p.postedAt ? Date.parse(p.postedAt) : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  const latest = posts
    .filter((p) => p.views !== null && Number.isFinite(p.views))
    .sort((a, b) => at(b) - at(a))
    .slice(0, window);
  let viewSum = 0;
  let engaged = 0;
  for (const p of latest) {
    if (!p.views || p.views <= 0) continue;
    viewSum += p.views;
    engaged += (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
  }
  return {
    medianViews: median(latest.map((p) => p.views as number)),
    engagementRate: viewSum > 0 ? engaged / viewSum : null,
    posts: latest.length,
  };
}
