/**
 * Map a RAG relevance score to a color tier. The score field is a fused
 * hybrid score (vector + lexical, optionally re-ranked) — for cosine /
 * cross-encoder rerankers it usually lives in the 0–1 band and rarely clears
 * 0.6, so the thresholds are tuned LOW on purpose: a "strong" RAG hit is ~0.45+,
 * not the ~0.8 you'd expect from a normalized probability.
 *
 * One source of truth for the score → color language so every RAG surface
 * (tool-call card, popover, the /rag/search list) speaks it identically.
 * Returns Tailwind class fragments that are light/dark safe.
 */

export type RelevanceLevel = "strong" | "moderate" | "weak";

export interface RelevanceTier {
  level: RelevanceLevel;
  /** Human label for the popover. */
  label: string;
  /** Soft tinted badge (rounded-md chip) — bg + text, NOT a full pill. */
  badge: string;
  /** Solid fill for a relevance bar. */
  bar: string;
  /** Text-only accent (for numbers in the breakdown). */
  text: string;
}

const STRONG: RelevanceTier = {
  level: "strong",
  label: "Strong match",
  badge:
    "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  bar: "bg-emerald-500",
  text: "text-emerald-700 dark:text-emerald-300",
};
const MODERATE: RelevanceTier = {
  level: "moderate",
  label: "Moderate match",
  badge:
    "bg-amber-500/12 text-amber-700 ring-amber-500/20 dark:text-amber-300",
  bar: "bg-amber-500",
  text: "text-amber-700 dark:text-amber-300",
};
const WEAK: RelevanceTier = {
  level: "weak",
  label: "Weak match",
  badge: "bg-slate-400/15 text-slate-600 ring-slate-400/25 dark:text-slate-300",
  bar: "bg-slate-400",
  text: "text-slate-600 dark:text-slate-300",
};

/** Absolute-quality tier for a hybrid RAG score. */
export function scoreTier(score: number): RelevanceTier {
  if (score >= 0.45) return STRONG;
  if (score >= 0.28) return MODERATE;
  return WEAK;
}

/**
 * Relative strength of a hit within its result set (0–1), for a relevance bar.
 * Normalized against the TOP score so the best hit reads full and the rest
 * fall in proportion — a within-set ranking aid, not an absolute-quality claim
 * (that's the color, from {@link scoreTier}). Floored at 8% so even a near-zero
 * hit shows a sliver.
 */
export function relativeStrength(score: number, topScore: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0.08;
  if (!Number.isFinite(topScore) || topScore <= 0) return 0.08;
  return Math.max(0.08, Math.min(1, score / topScore));
}
