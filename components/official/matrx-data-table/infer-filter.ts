import type { ColumnFilterKind, MatrxColumnDef } from "./types";
import {
  SELECT_EMPTY_VALUE,
  SELECT_NOT_EMPTY_VALUE,
  getCellValue,
  stringifyCellValue,
} from "./filter-engine";

/** Auto-inference switches to text above this many distinct values… */
const SELECT_CARDINALITY_CAP = 24;
/** …but a column that EXPLICITLY declares `filter: "select"` lists them all
 * (capped only as a runaway guard) — never silently truncate declared intent. */
const EXPLICIT_SELECT_CAP = 500;

export type ResolvedFilterKind = "text" | "select" | "boolean" | "number";

/**
 * Infer a filter UI from sample row values. Prefer select for low-cardinality
 * string/enum columns, boolean for booleans, number for numeric, else text.
 */
export function resolveFilterKind<T>(
  col: MatrxColumnDef<T>,
  sampleRows: T[],
): ResolvedFilterKind | null {
  if (col.filter === false) return null;
  if (col.filter && col.filter !== "auto") return col.filter;

  const values = sampleRows
    .slice(0, 200)
    .map((row) => getCellValue(row, col))
    .filter((v) => v != null);

  if (values.length === 0) return "text";

  if (values.every((v) => typeof v === "boolean")) return "boolean";
  if (values.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return "number";
  }

  const strings = values.map(stringifyCellValue);
  const unique = new Set(strings);
  if (
    unique.size >= 1 &&
    unique.size <= SELECT_CARDINALITY_CAP &&
    unique.size < strings.length * 0.6
  ) {
    return "select";
  }

  return "text";
}

export function collectSelectOptions<T>(
  col: MatrxColumnDef<T>,
  rows: T[],
): Array<{ value: string; label: string }> {
  const cap =
    col.filter === "select" ? EXPLICIT_SELECT_CAP : SELECT_CARDINALITY_CAP;
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];
  let hasEmpty = false;
  for (const row of rows) {
    const raw = getCellValue(row, col);
    const value = raw == null ? "" : stringifyCellValue(raw);
    if (!value) {
      hasEmpty = true;
      continue;
    }
    if (col.filterOptions?.length || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: value });
    if (options.length >= cap) break;
  }
  const base = col.filterOptions?.length
    ? [...col.filterOptions]
    : options.sort((a, b) => a.label.localeCompare(b.label));
  // Emptiness sentinels: whenever the column has blank cells, every select
  // filter can isolate them — or exclude them — with zero per-table config.
  if (hasEmpty) {
    base.unshift(
      { value: SELECT_EMPTY_VALUE, label: "(empty)" },
      { value: SELECT_NOT_EMPTY_VALUE, label: "(not empty)" },
    );
  }
  return base;
}

export function filterKindLabel(
  kind: ColumnFilterKind | ResolvedFilterKind,
): string {
  switch (kind) {
    case "text":
      return "Text";
    case "select":
      return "Select";
    case "boolean":
      return "Boolean";
    case "number":
      return "Number";
    case "auto":
      return "Auto";
    case false:
      return "Off";
  }
}
