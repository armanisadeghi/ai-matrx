"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";

// ============================================================================
// Authority tier resolution — kept STRUCTURED, never concatenated.
//   score (a number), tier (a colored label), reasoning (a sentence) stay
//   three distinct fields everywhere. This module only resolves the *tier*
//   so visuals (glow, bar color, sort bucket) agree with AuthorityTierBadge.
// ============================================================================

export type AuthorityTier = "high" | "medium" | "low";

/** Mirrors AuthorityTierBadge.normalizeTier so every results visual agrees
 *  on the same bucket boundaries (≥75 high, ≥45 medium, else low). */
export function resolveTier(
  tier: string | null,
  score: number | null,
): AuthorityTier | null {
  const t = (tier ?? "").toLowerCase();
  if (t === "high" || t === "medium" || t === "low") return t;
  if (score == null) return null;
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export interface TierVisual {
  /** Solid hex for the score bar fill / glow color. */
  color: string;
  /** Tailwind classes for the bar gradient. */
  barClass: string;
  /** Soft row-tint background (left-edge wash). */
  rowTintClass: string;
  /** Ring/border accent used while the row glows in. */
  ringClass: string;
  /** Prominent score number color. */
  scoreClass: string;
  /** box-shadow glow used on the high-authority rows. */
  glow: string;
}

/** High → green→blue glow, Medium → amber, Low → rose. */
export const TIER_VISUALS: Record<AuthorityTier, TierVisual> = {
  high: {
    color: "#22c55e",
    barClass: "bg-gradient-to-r from-emerald-500 to-sky-500",
    rowTintClass:
      "bg-gradient-to-r from-emerald-500/[0.07] via-sky-500/[0.04] to-transparent",
    ringClass: "ring-1 ring-emerald-500/30",
    scoreClass: "text-emerald-600 dark:text-emerald-400",
    glow: "0 0 22px -4px rgba(16,185,129,0.45)",
  },
  medium: {
    color: "#f59e0b",
    barClass: "bg-gradient-to-r from-amber-400 to-amber-500",
    rowTintClass:
      "bg-gradient-to-r from-amber-500/[0.06] to-transparent",
    ringClass: "ring-1 ring-amber-500/25",
    scoreClass: "text-amber-600 dark:text-amber-400",
    glow: "0 0 16px -6px rgba(245,158,11,0.35)",
  },
  low: {
    color: "#f43f5e",
    barClass: "bg-gradient-to-r from-rose-400 to-rose-500",
    rowTintClass:
      "bg-gradient-to-r from-rose-500/[0.07] to-transparent",
    ringClass: "ring-1 ring-rose-500/20",
    scoreClass: "text-rose-600 dark:text-rose-400",
    glow: "none",
  },
};

const TIER_LABEL: Record<AuthorityTier, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function tierLabel(tier: AuthorityTier): string {
  return TIER_LABEL[tier];
}

// ============================================================================
// useCountUp — animate a number from 0 → target on mount (and on target
//   change). Uses motion's `animate` so it shares the app's spring/easing
//   feel and cleans itself up. Respects prefers-reduced-motion by snapping.
// ============================================================================

interface CountUpOptions {
  /** Seconds. */
  duration?: number;
  /** Decimal places to render. */
  decimals?: number;
  /** Delay before starting, seconds. */
  delay?: number;
}

export function useCountUp(
  target: number,
  { duration = 1.1, decimals = 0, delay = 0 }: CountUpOptions = {},
): number {
  const [value, setValue] = useState(0);
  const prefersReduced = useRef(false);

  useEffect(() => {
    prefersReduced.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }, []);

  useEffect(() => {
    const safeTarget = Number.isFinite(target) ? target : 0;
    if (prefersReduced.current || safeTarget === 0) {
      setValue(safeTarget);
      return undefined;
    }
    const factor = 10 ** decimals;
    const controls = animate(0, safeTarget, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        setValue(Math.round(latest * factor) / factor);
      },
    });
    return () => controls.stop();
  }, [target, duration, decimals, delay]);

  return value;
}

// ============================================================================
// Formatting helpers
// ============================================================================

const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const PLAIN = new Intl.NumberFormat("en-US");

/** 1234 → "1,234"; large numbers stay readable in the hero tiles. */
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return PLAIN.format(Math.round(n));
}

/** 1_234_567 → "1.2M" for very large character/token counts. */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return COMPACT.format(Math.round(n));
}

/** USD with adaptive precision — sub-dollar amounts keep cents/mills. */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Google favicon service with a usable default size. */
export function faviconUrl(hostname: string | null): string | null {
  if (!hostname) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    hostname,
  )}&sz=64`;
}
