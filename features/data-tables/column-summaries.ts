/**
 * column-summaries.ts — the summary bar under a data table (Airtable's
 * "summary bar", Sheets' status-bar aggregates), as pure functions.
 *
 * A summary is a per-VIEW choice per column (`summaries` in the view state,
 * URL `agg=budget:sum,status:filled`). It is computed in the browser over the
 * rows the browser holds, and THE HONESTY RULE applies: when those rows are not
 * the whole table (a page of a large table), the bar says "this page" — it
 * never lets a page sum read as a table sum.
 */

import { formatFieldValue } from "@/lib/field-formats/format";
import type { FieldFormatConfig } from "@/lib/field-formats/types";

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

export const NUMERIC_SUMMARY_KINDS: readonly ColumnSummaryKind[] = [
  "sum", "avg", "min", "max", "median",
];

export const COLUMN_SUMMARY_LABELS: Record<ColumnSummaryKind, string> = {
  sum: "Sum",
  avg: "Average",
  min: "Min",
  max: "Max",
  median: "Median",
  count: "Count",
  filled: "Filled",
  empty: "Empty",
  unique: "Unique",
};

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

/** The kinds that make sense for a column: numbers get the arithmetic ones. */
export function summaryKindsFor(dataType: string): readonly ColumnSummaryKind[] {
  return dataType === "number" || dataType === "integer"
    ? COLUMN_SUMMARY_KINDS
    : (["count", "filled", "empty", "unique"] as const);
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s]/g, "").replace(/^\$/, ""));
    return v.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

export type ColumnSummaryResult = {
  /** The formatted value ("$84,000", "3 of 6", "42%"). */
  text: string;
  /** Screen-reader / tooltip sentence. */
  detail: string;
};

/**
 * Compute one column's summary over `rows`. `format` is the column's display
 * format so a currency sum reads as currency; counts are always plain.
 */
export function computeColumnSummary(
  rows: readonly { data: Record<string, unknown> }[],
  fieldName: string,
  kind: ColumnSummaryKind,
  dataType: string,
  format: FieldFormatConfig | null | undefined,
): ColumnSummaryResult {
  const values = rows.map((r) => r.data?.[fieldName]);
  const filled = values.filter((v) => !isBlank(v));
  const total = values.length;

  const fmt = (n: number): string => {
    const shown = formatFieldValue(n, format, dataType);
    return shown.ok && shown.text ? shown.text : String(Math.round(n * 100) / 100);
  };

  switch (kind) {
    case "count":
      return { text: String(total), detail: `${total} row${total === 1 ? "" : "s"}` };
    case "filled":
      return { text: `${filled.length} / ${total}`, detail: `${filled.length} of ${total} filled` };
    case "empty": {
      const n = total - filled.length;
      return { text: `${n} / ${total}`, detail: `${n} of ${total} empty` };
    }
    case "unique": {
      const n = new Set(filled.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))).size;
      return { text: String(n), detail: `${n} unique value${n === 1 ? "" : "s"}` };
    }
    default: {
      const nums = filled.map(toNumber).filter((n): n is number => n !== null);
      if (nums.length === 0) return { text: "—", detail: "No numbers in this column" };
      const sorted = [...nums].sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      let n: number;
      switch (kind) {
        case "sum": n = sum; break;
        case "avg": n = Math.round((sum / nums.length) * 100) / 100; break;
        case "min": n = sorted[0]; break;
        case "max": n = sorted[sorted.length - 1]; break;
        case "median": {
          const mid = Math.floor(sorted.length / 2);
          n = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
          break;
        }
      }
      return {
        text: fmt(n),
        detail: `${COLUMN_SUMMARY_LABELS[kind]} of ${nums.length} number${nums.length === 1 ? "" : "s"}`,
      };
    }
  }
}
