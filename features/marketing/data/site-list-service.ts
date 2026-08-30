// The EntityListPage adapter for marketing sites. Database ownership stays in
// `listSites`: this module only translates the generic shell's query vocabulary
// into the canonical table query it already serves.

import type {
  ColumnFilterValue,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import type { EntityListService } from "@/lib/entity-list/config";
import type {
  EntityFilterValue,
  EntityListQuery,
  EntityListSort,
} from "@/lib/entity-list/types";
import type { SiteListRow } from "@/features/marketing/types";
import { listSites } from "./service";

function toTableFilter(filter: EntityFilterValue): ColumnFilterValue {
  switch (filter.kind) {
    case "text":
      return { kind: "text", value: filter.value };
    case "select":
      return {
        kind: "select",
        value: filter.values[0] ?? "",
        values: filter.values,
      };
    case "boolean":
      return { kind: "boolean", value: filter.value };
  }
}

/** Pure vocabulary adapter; paging and sort remain server-owned by listSites. */
export function toSiteTableQueryState(
  query: EntityListQuery,
  sort: EntityListSort,
): MatrxDataTableQueryState {
  const columnFilters: MatrxDataTableQueryState["columnFilters"] = {};
  for (const [columnId, filter] of Object.entries(query.filters)) {
    columnFilters[columnId] = toTableFilter(filter);
  }

  return {
    page: query.page,
    pageSize: sort.pageSize,
    search: query.search,
    anyOf: "",
    columnFilters,
    sort: { id: sort.sort, direction: sort.direction },
  };
}

const COUNT_SORT: EntityListSort = {
  sort: "updated_at",
  direction: "desc",
  favoritesFirst: false,
  pageSize: 1,
};

/**
 * Build the generic entity-list service without inventing another site query.
 * `brandId` preserves the existing client-workspace narrowing when present.
 *
 * Sites deliberately expose one blended organization-browse scope. Counts use
 * a one-row `listSites` request so the number is the canonical query's exact
 * filtered total, not the current page length. Facets stay empty until that
 * same canonical path can aggregate them truthfully.
 */
export function siteListService(
  brandId?: string | null,
): EntityListService<SiteListRow> {
  return {
    fetchPage: (query, sort) =>
      listSites(toSiteTableQueryState(query, sort), undefined, brandId),
    fetchCounts: async (query) => {
      const result = await listSites(
        toSiteTableQueryState({ ...query, page: 1 }, COUNT_SORT),
        undefined,
        brandId,
      );
      return {
        byKind: { orgs: result.total },
        narrow: {},
      };
    },
    fetchFacets: async () => ({ byKind: {} }),
  };
}
