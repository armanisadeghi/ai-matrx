/**
 * GOOGLE'S DAY IS PACIFIC.
 *
 * Search Console buckets every day in `America/Los_Angeles` (with DST) and
 * offers no UTC option. Anything that asks "what day should GSC data reach
 * by now?" must ask that question in Google's calendar, not the viewer's and
 * not UTC's. Deriving it from UTC names a day that has not started in
 * California for the 7-8 hours after UTC midnight, which reports every site
 * as one day staler than it is.
 *
 * This module is the ONE place the conversion happens on the frontend. Its
 * counterparts:
 *   - server-side ingestion: `gsc_today()` in aidream
 *     packages/matrx-seo/matrx_seo/providers/gsc.py (aidream commit 871385cf8),
 *     documented in aidream/services/seo/FEATURE.md.
 *   - the health verdict: `seo.gsc_ingestion_health`, v5 onward
 *     (migrations/seo_gsc_ingestion_health_v5.sql) — `v_gsc_timezone`.
 * All three must agree on what day it is. Change one, change them all.
 */

/** Google's Search Console day-boundary zone. */
export const GSC_TIMEZONE = "America/Los_Angeles";

// Read the offset from the tz database, never a constant — Pacific is UTC-8
// for part of the year and UTC-7 for the rest.
const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: GSC_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date (`YYYY-MM-DD`) in Google's Search Console day-boundary zone. */
export function gscToday(now: Date = new Date()): string {
  const parts = DAY_PARTS.formatToParts(now);
  const at = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${at("year")}-${at("month")}-${at("day")}`;
}

/** `iso` (`YYYY-MM-DD`) shifted by whole days, still as `YYYY-MM-DD`. */
export function shiftGscDay(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days between two `YYYY-MM-DD` dates (`to - from`), or null. */
export function gscDayDiff(from: string, to: string): number | null {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
