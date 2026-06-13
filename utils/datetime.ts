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

export type TimestampInput = string | number | Date | null | undefined;

/** True when a string already carries a timezone designator (Z or ±offset). */
function hasTimezoneDesignator(s: string): boolean {
  // Trailing Z / z.
  if (/[zZ]$/.test(s)) return true;
  // Trailing numeric offset: +00, -07, +0000, +00:00, -07:30.
  if (/[+-]\d{2}(:?\d{2})?$/.test(s)) return true;
  // Named zones occasionally arrive from non-DB sources.
  if (/\b(GMT|UTC)\b/i.test(s)) return true;
  return false;
}

/**
 * Normalize a raw timestamp string so `new Date()` parses it as an absolute
 * instant. Naive (zone-less) strings WITH a time component are assumed UTC.
 */
function normalizeTimestampString(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  // No time component → not a timestamp (date-only). Leave it alone; the
  // caller is using the wrong helper, but we won't corrupt the value.
  if (!/\d{1,2}:\d{2}/.test(s)) return s;
  if (hasTimezoneDesignator(s)) return s;
  // Naive UTC: turn the SQL space separator into 'T' (more portable across
  // JS engines) and pin it to UTC.
  return `${s.replace(" ", "T")}Z`;
}

let warnedOnce = false;

/**
 * Parse any backend timestamp into a `Date`, correctly handling both
 * timezone-aware and naive (assumed-UTC) strings. Returns `null` for
 * empty / unparseable input.
 */
export function parseTimestamp(value: TimestampInput): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== "string") return null;
  const normalized = normalizeTimestampString(value);
  if (!normalized) return null;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    // Loud recovery: a value reached display code that we couldn't parse.
    if (process.env.NODE_ENV !== "production" && !warnedOnce) {
      warnedOnce = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[datetime] Unparseable timestamp passed to parseTimestamp: ${JSON.stringify(
          value,
        )}. Returning null. (further warnings suppressed)`,
      );
    }
    return null;
  }
  return d;
}

/** Epoch milliseconds for a timestamp, or `NaN` when unparseable. */
export function toEpochMs(value: TimestampInput): number {
  const d = parseTimestamp(value);
  return d ? d.getTime() : NaN;
}

const REL_UNITS: {
  limit: number;
  divisor: number;
  short: string;
  long: string;
}[] = [
  { limit: 60_000, divisor: 1000, short: "s", long: "second" },
  { limit: 3_600_000, divisor: 60_000, short: "m", long: "minute" },
  { limit: 86_400_000, divisor: 3_600_000, short: "h", long: "hour" },
  { limit: 604_800_000, divisor: 86_400_000, short: "d", long: "day" },
  { limit: 2_592_000_000, divisor: 604_800_000, short: "w", long: "week" },
  { limit: 31_536_000_000, divisor: 2_592_000_000, short: "mo", long: "month" },
];

export interface RelativeTimeOptions {
  /** "short" → "2m ago"; "long" → "2 minutes ago". Default "short". */
  style?: "short" | "long";
  /** Value returned for null / unparseable input. Default "—". */
  fallback?: string;
}

/**
 * "2m ago" / "2 minutes ago". Falls back to an absolute local date after a
 * year. Timezone-agnostic (pure epoch diff), so it's never off by an offset
 * as long as the input parses to the right instant — which `parseTimestamp`
 * guarantees for naive UTC strings.
 */
export function formatRelativeTime(
  value: TimestampInput,
  options: RelativeTimeOptions = {},
): string {
  const { style = "short", fallback = "—" } = options;
  const d = parseTimestamp(value);
  if (!d) return fallback;
  const ms = Date.now() - d.getTime();
  if (ms < 0) return "just now";
  for (const unit of REL_UNITS) {
    if (ms < unit.limit) {
      const n = Math.max(1, Math.floor(ms / unit.divisor));
      if (style === "long") {
        return `${n} ${unit.long}${n === 1 ? "" : "s"} ago`;
      }
      return `${n}${unit.short} ago`;
    }
  }
  return formatAbsoluteDate(d);
}

/**
 * Absolute local date+time, e.g. "Jun 13, 2026, 9:32 AM". Always renders in
 * the viewer's timezone.
 */
export function formatAbsoluteDate(
  value: TimestampInput,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  fallback = "—",
): string {
  const d = parseTimestamp(value);
  if (!d) return fallback;
  return d.toLocaleString(undefined, options);
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
