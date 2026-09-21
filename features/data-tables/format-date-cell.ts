/**
 * The `/data` grid's date / datetime cell display — pulled out of
 * `UserTableViewer.formatCellValue` so the rule is testable on its own.
 *
 * A `date` column is a calendar day with no time or zone (Postgres `date`).
 * Routing it through `new Date(value)` interprets `"2026-01-01"` as UTC
 * midnight, and `.toLocaleString()` then renders it back in the browser's
 * OWN zone — a day early in any negative-offset timezone, and with a clock
 * time that a bare date never had (grid-parity `formats.all`, defect #2:
 * `Due` stored as `2026-01-01` showed as `12/31/2025, 4:00:00 PM`).
 *
 * `datetime` really does carry a moment in time, so it keeps shifting into
 * the viewer's local zone — that part was always correct.
 *
 * FIX-7B fixed the same class in the shared primitive's formatter by
 * round-tripping a date-only string through a LOCAL `Date` instead of
 * `new Date(string)` (see `utils/dateOnly.ts`). This reuses that rule rather
 * than inventing a third way to parse a date.
 */
import { formatDateOnly } from "@/utils/dateOnly";

export function formatDateCellDisplay(
  value: unknown,
  dataType: "date" | "datetime",
): string {
  if (dataType === "date") {
    // `formatDateOnly` round-trips the `yyyy-mm-dd` string through a LOCAL
    // `Date` — no UTC parse, no zone shift, no time-of-day.
    return formatDateOnly(
      typeof value === "string" ? value : String(value),
      { dateStyle: "medium" },
    );
  }
  // `datetime` is a real timestamp — local zone + time is the correct answer.
  return new Date(value as string | number | Date).toLocaleString();
}
