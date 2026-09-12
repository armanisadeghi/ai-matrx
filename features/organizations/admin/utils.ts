/**
 * Formatting helpers for org-admin metrics. Pure, no side effects.
 */

import {
  formatFileSize,
  formatRelativeTime as kitFormatRelativeTime,
} from "@ai-matrx/kit/format";

/**
 * Compact relative-time label, e.g. "3d ago", "Never". The formatting is the
 * package's (`@ai-matrx/kit/format`, census H1); the "Never" fallback is this
 * roster's own word for "no activity on record", which is not the same
 * statement as an em-dash.
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  return kitFormatRelativeTime(iso, { fallback: "Never" });
}

/**
 * Human-readable byte size — a `formatFileSize` twin the 2026-09-07 census
 * missed because it wore a different name. THE package formatter carries the
 * same "a missing size is never a confident 0 B" guard this copy earned; the
 * one display change is where the decimal drops (at 10 in a unit, not 100), so
 * `50.0 KB` now reads `50 KB`.
 */
export const formatBytes = formatFileSize;

/** Milli-cents → USD string. 3996 mcents = $0.04. */
export function formatMcents(mcents: number | null | undefined): string {
  if (mcents == null) return "—";
  return `$${(mcents / 100000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** USD → milli-cents for storing a budget. Returns null for empty input. */
export function usdToMcents(usd: string | number | null | undefined): number | null {
  if (usd === "" || usd == null) return null;
  const n = typeof usd === "number" ? usd : Number(usd);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100000);
}

/**
 * GB (BINARY, 1 GB = 1024³ bytes) → bytes. Returns null for empty input.
 *
 * The comment said "decimal" while the body multiplied by 1024³ — a 7.4% lie
 * about every storage cap typed into this form. The BODY is right and stays:
 * it is the inverse of `bytesToGb` below and agrees with `formatFileSize`,
 * which is binary. A doc comment that disagrees with its body is worse than
 * none — it is what the next reader trusts instead of reading the code.
 */
export function gbToBytes(gb: string | number | null | undefined): number | null {
  if (gb === "" || gb == null) return null;
  const n = typeof gb === "number" ? gb : Number(gb);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1024 * 1024 * 1024);
}

/** Bytes → GB number, BINARY (1024³) — the exact inverse of `gbToBytes`. */
export function bytesToGb(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  return (bytes / (1024 * 1024 * 1024)).toString();
}


/** Coarse activity bucket used for the roster "engagement" signal. */
export type ActivityBucket = "active" | "idle" | "dormant" | "never";

export function activityBucket(lastActivityIso: string | null | undefined): ActivityBucket {
  if (!lastActivityIso) return "never";
  const days = (Date.now() - new Date(lastActivityIso).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return "active";
  if (days <= 30) return "idle";
  return "dormant";
}
