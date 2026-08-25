/**
 * Value-shape recognition for tabular cells — LAW 3b (`common-docs/policies/
 * no-dead-ends.md`, Arman 2026-08-25):
 *
 * > "A UUID renders as a shortened id with a copy control WHEREVER a UUID
 * > appears, not only where a column happened to be declared `uuid`. […]
 * > Declared type is a hint; the value is the truth."
 *
 * The measured defect this closes: `data_table` cells were rendered from the
 * DECLARED column type alone, so on a real `seo.serp_opportunity` read the one
 * column the source typed (`id`) got the shortened-id + copy treatment while
 * every foreign key on the same row — the same 36-character UUID, in a column
 * the source typed `string` or did not type at all — rendered raw. To a reader
 * that is not "faithful to the source", it is an inconsistent, half-built
 * table.
 *
 * ── INVENTORY LAW ────────────────────────────────────────────────────────────
 * Nothing here re-implements a detector the platform already owns.
 * `looksLikeUuid`, `looksLikeUrl` and `humanizeKey` are the tool-result field
 * library's (`features/tool-call-visualization/result-fields/shape.ts`) — the
 * same functions `StructuredValueView` recognizes values with, so a UUID looks
 * the same in a table cell as it does in a tool result. What is added here and
 * did not exist: whole-string EMAIL and ISO-TIMESTAMP recognition, and the
 * date-only formatting rule below.
 *
 * 🚨 RECOGNITION NEVER COERCES. It changes how a value is PRESENTED, never
 * what it is: a recognized timestamp still carries its exact source string in
 * the title, a recognized number is not re-parsed, and a string of digits is
 * never promoted to a number (that is how `"01234"` stops being a ZIP code).
 */

import {
  looksLikeUrl,
  looksLikeUuid,
} from "@/features/tool-call-visualization/result-fields/shape";

export { looksLikeUrl, looksLikeUuid };

/** A whole-string email address (no surrounding prose). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/** ISO-8601 date, or date + time with an optional zone. Whole string only. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

export type TemporalShape = "date" | "datetime";

export function temporalShape(value: string): TemporalShape | null {
  if (ISO_DATE_RE.test(value)) return "date";
  if (ISO_DATETIME_RE.test(value)) return "datetime";
  return null;
}

/**
 * Format a temporal value for a reader, or return null when it does not parse.
 *
 * 🚨 A DATE-ONLY STRING IS NEVER PUT THROUGH `new Date(...)` FOR DISPLAY.
 * `new Date("2026-08-16")` is midnight UTC, which renders as *2026-08-15* for
 * every reader west of Greenwich — a table that silently moves a due date by a
 * day is worse than one that shows the raw string. Date-only values are
 * formatted from their own parts, in their own calendar.
 */
export function formatTemporal(
  value: string,
  shape: TemporalShape | "time",
): string | null {
  if (shape === "date") {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if (!year || !month || !day) return null;
    // Local-calendar construction: no zone conversion can happen.
    return new Date(year, month - 1, day).toLocaleDateString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return shape === "time"
    ? parsed.toLocaleTimeString()
    : parsed.toLocaleString();
}

/**
 * A URL shortened for a cell: the host plus the last meaningful path segment.
 * The full URL always survives in the title and in the link itself — this only
 * decides what a reader sees on one line.
 */
export function urlLabel(value: string): string {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    const host = url.hostname.replace(/^www\./, "");
    if (!last) return host;
    const trimmed = last.length > 28 ? `${last.slice(0, 28)}…` : last;
    return `${host}/${segments.length > 1 ? "…/" : ""}${trimmed}`;
  } catch {
    return value;
  }
}
