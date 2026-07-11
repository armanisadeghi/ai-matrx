import type { ColumnFilterKind, MatrxColumnDef } from "./types";
import { getCellValue, stringifyCellValue } from "./filter-engine";

const SELECT_CARDINALITY_CAP = 24;

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
  if (col.filterOptions?.length) return col.filterOptions;
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];
  for (const row of rows) {
    const raw = getCellValue(row, col);
    if (raw == null) continue;
    const value = stringifyCellValue(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: value });
    if (options.length >= SELECT_CARDINALITY_CAP) break;
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
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
