/**
 * Date-only (`yyyy-mm-dd`) helpers with NO timezone shift.
 *
 * A `date` column in Postgres has no time/zone — it's a calendar day. Parsing
 * `"2026-06-08"` through `new Date("2026-06-08")` interprets it as UTC midnight,
 * which renders as the *previous* day in any negative-offset timezone. These
 * helpers round-trip the string ↔ a LOCAL `Date` so the day a user picks is the
 * day that gets stored and shown, everywhere.
 *
 * Use for any `date` (not `timestamp`) field: task/project due & target dates,
 * etc. For timestamps, keep using `Date` / date-fns directly.
 */

/** Parse a `yyyy-mm-dd` (date-only) string into a LOCAL `Date` with no TZ shift. */
export function parseDateOnly(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** Serialize a `Date` back to a `yyyy-mm-dd` string (LOCAL, no TZ shift). */
export function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format a `yyyy-mm-dd` string for display (LOCAL, no TZ shift). Defaults to a
 * compact `Mon D` (e.g. `Jun 8`); pass options for a fuller label. Returns the
 * raw string unchanged if it isn't a valid date-only value.
 */
export function formatDateOnly(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  if (!value) return "";
  const d = parseDateOnly(value);
  if (!d) return value;
  return d.toLocaleDateString(undefined, options);
}

/** True when a date-only value is strictly before today (start of day, local). */
export function isDateOnlyOverdue(value: string | null | undefined): boolean {
  const d = parseDateOnly(value);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}
