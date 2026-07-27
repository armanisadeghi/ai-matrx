/**
 * Shared scope helpers for the Marketing surfaces that render a
 * `MatrxDataTable` over URL-owned query state (`useMarketingTableState`).
 *
 * Every list surface declares a `list_query` value answering "why are THESE
 * rows the ones you were given" — search, column filters, sort, page, page
 * size. Building it once here keeps the shape identical across the hub views
 * (brands, sites, cost) and the site-level page registry, so an agent bound to
 * two of them reads the same object.
 *
 * Pure functions only — called at trigger time from a `getScope()`; they never
 * fetch and never touch React state.
 */

import type {
  ColumnFiltersState,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import type {
  MarketingNavEntry,
  MarketingNavPillar,
} from "@/features/marketing/lib/marketing-nav";

/** Human-readable snapshot of the column filters actually applied. */
function describeFilters(
  filters: ColumnFiltersState,
): Record<string, unknown> | undefined {
  const applied: Record<string, unknown> = {};
  for (const [column, filter] of Object.entries(filters)) {
    if (!filter) continue;
    if (filter.kind === "number") {
      applied[column] = { min: filter.min ?? null, max: filter.max ?? null };
    } else {
      applied[column] = filter.value;
    }
  }
  return Object.keys(applied).length > 0 ? applied : undefined;
}

/**
 * The canonical `list_query` value. `mode` carries the table's extra
 * single-select dimension (`anyOf`) where a surface uses one — the cost
 * workspace's rollup mode, for example.
 */
export function marketingListQuery(
  state: MatrxDataTableQueryState,
): Record<string, unknown> {
  return {
    search: state.search || null,
    column_filters: describeFilters(state.columnFilters) ?? null,
    sort: state.sort
      ? { id: state.sort.id, direction: state.sort.direction }
      : null,
    page: state.page,
    page_size: state.pageSize,
    mode: state.anyOf || null,
  };
}

function describeEntry(entry: MarketingNavEntry): Record<string, unknown> {
  return {
    label: entry.label,
    href: entry.href,
    description: entry.description,
    status: entry.status ?? "live",
    external: entry.external ?? false,
  };
}

/** The `hub_pillars` value — the Marketing feature's own map, as rendered. */
export function marketingPillarMap(
  pillars: readonly MarketingNavPillar[],
): ReadonlyArray<Record<string, unknown>> {
  return pillars.map((pillar) => ({
    key: pillar.key,
    label: pillar.label,
    description: pillar.description,
    entries: pillar.entries.map(describeEntry),
  }));
}
