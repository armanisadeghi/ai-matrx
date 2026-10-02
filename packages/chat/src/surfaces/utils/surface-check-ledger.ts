/**
 * features/surfaces/utils/surface-check-ledger.ts
 *
 * The read side of THE UI SURFACE CHECKLIST ledger (`.claude/skills/surface-check/`).
 *
 * An agent that completes the full checklist on a surface stamps
 * `ui.ui_surface.last_checked_at / last_checked_by / last_check`. This module
 * is the ONE place that interprets those columns, so the admin hub, any future
 * dispatcher, and the rolling cycle all agree on what "stale" means.
 *
 * Staleness is a KNOB, not a constant sprinkled at call sites: the platform
 * default lives here with a dated review, per
 * `common-docs/policies/limits-are-knobs-agents-set-them.md`.
 */

/**
 * How long a completed check stays fresh.
 *
 * Agent-chosen starting value 2026-08-22: 30 days. Rationale — a surface's
 * code churns on a weekly-to-monthly cadence in this repo, and the checklist
 * covers 18 sections that mostly only change when the surface's own code does.
 * REVIEW 2026-11-22: if the rolling cycle empties the queue long before 30
 * days, shorten it; if surfaces keep coming back clean, lengthen it.
 */
export const SURFACE_CHECK_FRESH_DAYS = 30;

export type SurfaceCheckState = "never" | "stale" | "fresh";

export interface SurfaceCheckLedgerRow {
  last_checked_at?: string | null;
}

/** Whole days since the last completed check, or null if never checked. */
export function daysSinceCheck(
  row: SurfaceCheckLedgerRow,
  now: number = Date.now(),
): number | null {
  if (!row.last_checked_at) return null;
  const then = new Date(row.last_checked_at).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/**
 * never = the checklist has never completed here (the front of the queue).
 * stale = completed, but older than the freshness knob.
 * fresh = completed within the window.
 */
export function surfaceCheckState(
  row: SurfaceCheckLedgerRow,
  now: number = Date.now(),
): SurfaceCheckState {
  const days = daysSinceCheck(row, now);
  if (days === null) return "never";
  return days > SURFACE_CHECK_FRESH_DAYS ? "stale" : "fresh";
}

/** Compact age label for a table cell. */
export function checkAgeLabel(
  row: SurfaceCheckLedgerRow,
  now: number = Date.now(),
): string {
  const days = daysSinceCheck(row, now);
  if (days === null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo` : `${Math.floor(days / 365)}y`;
}

/**
 * Sort weight so the dispatch order is the work order: never-checked first,
 * then oldest. Used by the hub's "Checked" column and by any dispatcher that
 * picks the next surface.
 */
export function checkSortWeight(
  row: SurfaceCheckLedgerRow,
  now: number = Date.now(),
): number {
  const days = daysSinceCheck(row, now);
  return days === null ? Number.MAX_SAFE_INTEGER : days;
}
