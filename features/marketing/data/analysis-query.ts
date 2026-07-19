import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function analysisTableRange(state: MatrxDataTableQueryState) {
  const page = Math.max(1, state.page);
  const pageSize = Math.max(1, state.pageSize);
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

/** Keep PostgREST OR expressions data-only while preserving normal text search. */
export function cleanAnalysisSearch(value: string): string {
  return value
    .trim()
    .replace(/[(),"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function analysisTextFilter(
  state: MatrxDataTableQueryState,
  column: string,
): string | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "text" && filter.value.trim()
    ? cleanAnalysisSearch(filter.value)
    : null;
}

export function analysisSelectFilter(
  state: MatrxDataTableQueryState,
  column: string,
): string | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "select" && filter.value ? filter.value : null;
}

export function analysisNumberFilter(
  state: MatrxDataTableQueryState,
  column: string,
): { min?: number; max?: number } | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "number"
    ? { min: filter.min, max: filter.max }
    : null;
}

export function analysisBooleanFilter(
  state: MatrxDataTableQueryState,
  column: string,
): boolean | null {
  const filter = state.columnFilters[column];
  return filter?.kind === "boolean" ? filter.value : null;
}

export function isUuidFilter(value: string | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function priorityRowKey(
  row: {
    site_id: string | null;
    page_id: string | null;
    item_id: string | null;
    item_key: string | null;
  },
  absoluteIndex: number,
): string {
  return [
    row.site_id ?? "site",
    row.page_id ?? "site-subject",
    row.item_id ?? row.item_key ?? "item",
    absoluteIndex,
  ].join(":");
}
