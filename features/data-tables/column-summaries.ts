/**
 * column-summaries.ts — a per-VIEW choice of summary per column
 * (`summaries` in the view state, URL `agg=budget:sum,status:filled`), as pure
 * functions: the kinds, and the URL form. The records-ui grid computes and draws the bar.
 */

export type ColumnSummaryKind =
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "median"
  | "count"
  | "filled"
  | "empty"
  | "unique";

export const COLUMN_SUMMARY_KINDS: readonly ColumnSummaryKind[] = [
  "sum", "avg", "min", "max", "median", "count", "filled", "empty", "unique",
];

export type ColumnSummaryMap = Record<string, ColumnSummaryKind>;

export function isColumnSummaryKind(raw: unknown): raw is ColumnSummaryKind {
  return typeof raw === "string" && (COLUMN_SUMMARY_KINDS as readonly string[]).includes(raw);
}

/** `agg=budget:sum,status:filled` → map. Unknown kinds are dropped, never guessed. */
export function parseColumnSummaries(raw: string | null): ColumnSummaryMap {
  const out: ColumnSummaryMap = {};
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const at = part.lastIndexOf(":");
    if (at <= 0) continue;
    const name = part.slice(0, at).trim();
    const kind = part.slice(at + 1).trim();
    if (name && isColumnSummaryKind(kind)) out[name] = kind;
  }
  return out;
}

/** Stable (sorted by field) so equal maps serialize identically. */
export function serializeColumnSummaries(map: ColumnSummaryMap): string | null {
  const entries = Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.length > 0 ? entries.map(([k, v]) => `${k}:${v}`).join(",") : null;
}

export function isColumnSummaryMap(value: unknown): value is ColumnSummaryMap {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(isColumnSummaryKind)
  );
}
