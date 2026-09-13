/**
 * Formatting helpers for org-admin metrics. Pure, no side effects.
 */

import {
  formatRelativeTime as kitFormatRelativeTime,
  formatUsd,
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

// THE `formatBytes` ALIAS IS GONE (2026-09-12). It was a `formatFileSize` twin
// collapsed to a one-line alias, and the alias is its own defect: the guard
// that judges what ENTERS formatFileSize hunts the export's own name, so six
// call sites here were outside it by construction. They import
// `formatFileSize` from "@ai-matrx/kit/format" under its own name now.
// (The display: a size at or above 10 in its unit reads `50 KB`, not `50.0 KB`.)

/** Milli-cents in the DB → the fleet's one USD string. 3996 mcents = $0.04. */
const MCENTS_PER_USD = 100_000;

/**
 * THE LOCALE WAS THE TWIN (2026-09-12). This re-implemented `formatUsd` —
 * dollar sign, two fixed digits, grouped thousands — with `toLocaleString`
 * called on `undefined`, which means THE VIEWER'S locale, while the package
 * pins `"en-US"`. On a de-DE or fr-FR browser that renders "$0,04" beside the
 * "$0.04" every other spend figure on the same screen prints: one number, two
 * decimal separators, and no way for a reader to tell which is the real one.
 *
 * Only the UNIT stays local — millicents is this schema's storage unit, not a
 * capability — so the conversion is one named constant and the rendering is
 * the package's.
 */
export function formatMcents(mcents: number | null | undefined): string {
  if (mcents == null) return "—";
  return formatUsd(mcents / MCENTS_PER_USD);
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
