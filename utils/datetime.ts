/**
 * utils/datetime.ts
 *
 * Canonical timestamp parsing + display for the whole app. ONE place that
 * knows how to turn a backend timestamp into a JS `Date` and into a
 * human-readable local-time string.
 *
 * ─── The bug this kills ────────────────────────────────────────────────
 * Postgres has two timestamp types and they serialize differently over
 * PostgREST / RPC:
 *
 *   • `timestamp with time zone` (timestamptz) → "2026-06-13T16:32:26+00:00"
 *     Has an explicit offset. `new Date()` parses it correctly.
 *
 *   • `timestamp without time zone`            → "2026-06-13T16:32:26"
 *     NO offset. Per the ES spec, a date-time string with a time part but
 *     no zone is parsed as *LOCAL* time. Our backend writes these columns
 *     in UTC, so `new Date("2026-06-13T16:32:26")` is wrong by the
 *     viewer's UTC offset — the classic "times are off by N hours" report.
 *
 * Tables still on the naive type today include `conversation`, `messages`,
 * `compiled_recipe`, and others. Every surface that rendered those times
 * with a bare `new Date(...)` was silently off.
 *
 * `parseTimestamp` normalizes both forms: a naive (no-zone) string with a
 * time component is treated as UTC. A timezone-aware string is left
 * untouched. Date-only strings (`yyyy-mm-dd`, no time) are NOT a timestamp
 * concern — use `utils/dateOnly.ts` for calendar-day columns.
 *
 * For DISPLAY everything renders in the viewer's local timezone (relative
 * "ago" strings are timezone-agnostic by construction; absolute strings
 * use `toLocale*` which is local by default).
 */

// ─────────────────────────────────────────────────────────────────────────
// THE PARSER AND THE TWO RELATIVE/ABSOLUTE FORMATTERS NOW LIVE IN THE PACKAGE.
//
// 2026-09-07, duplication census H1: this module and `@ai-matrx/diff` carried
// byte-level twins of the same four bodies, `@ai-matrx/associations` carried a
// third `formatRelativeTime`, and ~16 more copies were scattered across this
// repo and four others. The whole thing — including the Postgres
// zone-less-is-UTC correction described above, which is the entire reason this
// module exists — is now `@ai-matrx/kit/format`, the package with no sibling
// dependencies, so every Matrx client inherits the fix instead of re-earning
// it. This module stays as the app's door: the historical
// `@/utils/datetime` specifier keeps working for its ~40 callers, and
// `parseTimestamp` keeps the dev-time loud recovery, which is app policy
// rather than package logic.
// ─────────────────────────────────────────────────────────────────────────

import {
  parseTimestamp as kitParseTimestamp,
  type TimestampInput,
} from "@ai-matrx/kit/format";

export type { RelativeTimeOptions, TimestampInput } from "@ai-matrx/kit/format";
export {
  formatAbsoluteDate,
  formatRelativeTime,
} from "@ai-matrx/kit/format";

let warnedOnce = false;

/**
 * Parse any backend timestamp into a `Date`, correctly handling both
 * timezone-aware and naive (assumed-UTC) strings. Returns `null` for
 * empty / unparseable input.
 *
 * The parsing IS `@ai-matrx/kit/format`'s. What this door adds is the loud
 * recovery: a value that reached display code and could not be parsed says so
 * in development, once, instead of silently rendering an em-dash forever.
 */
export function parseTimestamp(value: TimestampInput): Date | null {
  const parsed = kitParseTimestamp(value);
  if (
    parsed === null &&
    value !== null &&
    value !== undefined &&
    value !== "" &&
    process.env.NODE_ENV !== "production" &&
    !warnedOnce
  ) {
    warnedOnce = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[datetime] Unparseable timestamp passed to parseTimestamp: ${JSON.stringify(
        value,
      )}. Returning null. (further warnings suppressed)`,
    );
  }
  return parsed;
}

/** Epoch milliseconds for a timestamp, or `NaN` when unparseable. */
export function toEpochMs(value: TimestampInput): number {
  const d = parseTimestamp(value);
  return d ? d.getTime() : NaN;
}

/** Local date only, e.g. "Jun 13, 2026". */
export function formatReadableDate(
  value: TimestampInput,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
  fallback = "—",
): string {
  const d = parseTimestamp(value);
  if (!d) return fallback;
  return d.toLocaleDateString(undefined, options);
}

/** Local time only, e.g. "9:32 AM". */
export function formatReadableTime(
  value: TimestampInput,
  options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  },
  fallback = "—",
): string {
  const d = parseTimestamp(value);
  if (!d) return fallback;
  return d.toLocaleTimeString(undefined, options);
}

/**
 * Numeric comparison helper for sorting by timestamp. Unparseable values
 * sort LAST regardless of direction (caller multiplies the sign).
 */
export function compareTimestamps(
  a: TimestampInput,
  b: TimestampInput,
): number {
  const ta = toEpochMs(a);
  const tb = toEpochMs(b);
  const aNan = Number.isNaN(ta);
  const bNan = Number.isNaN(tb);
  if (aNan && bNan) return 0;
  if (aNan) return 1;
  if (bNan) return -1;
  return ta - tb;
}
