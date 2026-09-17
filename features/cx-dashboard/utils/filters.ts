// URL search param <-> CxFilters helpers
import type { CxFilters, CxTimeframePreset } from "../types/cxDashboardTypes";

const TIMEFRAME_PRESETS = ["day", "week", "month", "quarter", "all"] as const;

export function filtersFromSearchParams(params: URLSearchParams): CxFilters {
  const timeframe = params.get("timeframe") as CxTimeframePreset | "custom" | null;
  return {
    timeframe: timeframe && [...TIMEFRAME_PRESETS, "custom"].includes(timeframe) ? timeframe : "month",
    start_date: params.get("start_date") ?? undefined,
    end_date: params.get("end_date") ?? undefined,
    user_id: params.get("user_id") ?? undefined,
    model_id: params.get("model_id") ?? undefined,
    provider: params.get("provider") ?? undefined,
    status: params.get("status") ?? undefined,
    search: params.get("search") ?? undefined,
    sort_by: params.get("sort_by") ?? undefined,
    sort_dir: (params.get("sort_dir") as "asc" | "desc") ?? undefined,
    page: params.get("page") ? Number(params.get("page")) : undefined,
    per_page: params.get("per_page") ? Number(params.get("per_page")) : undefined,
  };
}

export function filtersToSearchParams(filters: CxFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return params;
}

export function getTimeframeRange(preset: CxTimeframePreset): { start: string; end: string } | null {
  if (preset === "all") return null;
  const end = new Date();
  const start = new Date();
  switch (preset) {
    case "day":
      start.setDate(start.getDate() - 1);
      break;
    case "week":
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      start.setMonth(start.getMonth() - 1);
      break;
    case "quarter":
      start.setMonth(start.getMonth() - 3);
      break;
  }
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function buildWhereClause(
  filters: CxFilters,
  dateColumn: string = "created_at"
): { where: string; params: unknown[] } {
  const conditions: string[] = [`${dateColumn.includes('.') ? dateColumn : dateColumn} IS NOT NULL`];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Deleted_at filter is handled in the base query

  if (filters.timeframe !== "all" && filters.timeframe !== "custom") {
    const range = getTimeframeRange(filters.timeframe as CxTimeframePreset);
    if (range) {
      conditions.push(`${dateColumn} >= '${range.start}'`);
      conditions.push(`${dateColumn} <= '${range.end}'`);
    }
  } else if (filters.timeframe === "custom" && filters.start_date && filters.end_date) {
    conditions.push(`${dateColumn} >= '${filters.start_date}'`);
    conditions.push(`${dateColumn} <= '${filters.end_date}'`);
  }

  if (filters.user_id) {
    conditions.push(`user_id = '${filters.user_id}'`);
  }

  if (filters.status) {
    conditions.push(`status = '${filters.status}'`);
  }

  return { where: conditions.join(" AND "), params };
}

/** Source filters are distinct from sorting, page size and table view preferences. */
export function hasActiveCxSourceFilters(params: URLSearchParams): boolean {
  const filters = filtersFromSearchParams(params);
  return filters.timeframe !== "month" || Boolean(
    filters.start_date || filters.end_date || filters.user_id || filters.model_id ||
    filters.provider || filters.status || filters.search,
  );
}

/** Clear both query layers in one navigation, preserving sorting and view settings. */
export function clearCxTableFilters(params: URLSearchParams, tableId: string): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ["timeframe", "start_date", "end_date", "user_id", "model_id", "provider", "status", "search", "page"]) next.delete(key);
  for (const key of ["p", "q", "match", "scope", "any", "lf", "f"]) next.delete(`table.${tableId}.${key}`);
  return next;
}
