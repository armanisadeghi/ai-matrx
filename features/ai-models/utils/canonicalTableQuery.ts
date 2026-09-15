import type {
  ColumnFiltersState,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table";
import type { AiModelFilters, TabState } from "../hooks/useTabUrlState";
import { isContentType } from "../capabilities/types";

/** Preserve the catalog's existing URL/tab contract when using the shared table. */
export function modelFiltersToColumns(
  filters: AiModelFilters,
): ColumnFiltersState {
  const result: ColumnFiltersState = {};
  if (filters.provider)
    result.maker = { kind: "select", value: filters.provider };
  for (const key of ["input_capability", "output_capability"] as const) {
    if (filters[key]) result[key] = { kind: "select", value: filters[key] };
  }
  for (const key of ["is_deprecated", "is_primary", "is_premium"] as const) {
    if (filters[key] !== undefined)
      result[key] = { kind: "boolean", value: filters[key] };
  }
  for (const key of ["context_window", "max_tokens"] as const) {
    const min = filters[`${key}_min`];
    const max = filters[`${key}_max`];
    if (min !== undefined || max !== undefined)
      result[key] = { kind: "number", min, max };
  }
  return result;
}

export function modelQueryToTab(
  query: MatrxDataTableQueryState,
): Partial<Omit<TabState, "id">> {
  const filters: AiModelFilters = {
    provider: undefined,
    input_capability: undefined,
    output_capability: undefined,
    is_deprecated: undefined,
    is_primary: undefined,
    is_premium: undefined,
    context_window_min: undefined,
    context_window_max: undefined,
    max_tokens_min: undefined,
    max_tokens_max: undefined,
  };
  const provider = query.columnFilters.maker;
  if (provider?.kind === "select" && provider.value)
    filters.provider = provider.value;
  for (const key of ["input_capability", "output_capability"] as const) {
    const filter = query.columnFilters[key];
    if (filter?.kind === "select" && isContentType(filter.value))
      filters[key] = filter.value;
  }
  for (const key of ["is_deprecated", "is_primary", "is_premium"] as const) {
    const filter = query.columnFilters[key];
    if (filter?.kind === "boolean") filters[key] = filter.value;
  }
  for (const key of ["context_window", "max_tokens"] as const) {
    const filter = query.columnFilters[key];
    if (filter?.kind === "number") {
      filters[`${key}_min`] = filter.min;
      filters[`${key}_max`] = filter.max;
    }
  }
  return {
    q: query.search,
    sort: query.sort?.id ?? "",
    dir: query.sort?.direction ?? "asc",
    page: query.page,
    perPage: query.pageSize,
    filters,
  };
}
