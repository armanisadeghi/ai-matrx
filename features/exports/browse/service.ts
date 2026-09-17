// features/exports/browse/service.ts
//
// The entity-list service triple over `/media/libraries/{id}/items` and
// `/item-facets`. Built per Library rather than declared as a module constant,
// because every read is scoped to one Library id — which is why the config
// carries a `serviceKey` (the shell re-asks when the identity changes instead
// of keeping the answer it got for a different export).
//
// 🚨 `total` VS `filtered_total`. The shell's `EntityListPage.total` is what
// the pagination and the "Showing 100 of N" line are computed from, so it is
// the FILTERED total — `filtered_total`. The whole Library's size is a
// different, equally honest fact, and it reaches the screen through
// `onPageRead` (the summary strip says "… of 20,110 in this export"). Neither
// is ever `items.length`.

import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { EntityListService } from "@/lib/entity-list/config";
import {
  fetchExportItemFacets,
  fetchExportItems,
} from "../api";
import type { ExportItem, ExportItemsResponse, ExportSummary } from "../types";
import { toItemFilter, toItemOrder } from "./itemQuery";

/** What the page learns from every read, beyond the rows themselves. */
export interface ExportPageFacts {
  total: number;
  filteredTotal: number;
  filterDescription: string;
}

export interface ExportItemsServiceDeps {
  libraryId: string;
  /** The summary, when the index has produced one. Supplies the label,
   *  thread/channel and correspondent filter options — the items facets
   *  endpoint answers only direction and kind. */
  getSummary: () => ExportSummary | null;
  /** Called after every page read with both totals and the server's own
   *  sentence for the filter. */
  onPageRead?: (facts: ExportPageFacts) => void;
}

function countsToFacetValues(
  counts: Record<string, number> | undefined,
): { value: string; count: number }[] {
  if (!counts) return [];
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function createExportItemsService(
  deps: ExportItemsServiceDeps,
): EntityListService<ExportItem> {
  const { libraryId, getSummary, onPageRead } = deps;

  async function readPage(
    query: EntityListQuery,
    sort: EntityListSort,
  ): Promise<ExportItemsResponse> {
    return fetchExportItems(libraryId, {
      ...toItemFilter(query.filters, query.search),
      order: toItemOrder(sort.sort),
      dir: sort.direction,
      // The endpoint caps `limit` at 500; the shell's page sizes are well under
      // it, but a stored preference is still clamped rather than rejected.
      limit: Math.min(Math.max(sort.pageSize, 1), 500),
      offset: (query.page - 1) * sort.pageSize,
    });
  }

  return {
    async fetchPage(query, sort): Promise<EntityListPage<ExportItem>> {
      const response = await readPage(query, sort);
      onPageRead?.({
        total: Number(response.total ?? 0),
        filteredTotal: Number(response.filtered_total ?? 0),
        filterDescription: response.filter_description ?? "",
      });
      return {
        rows: response.items ?? [],
        total: Number(response.filtered_total ?? 0),
      };
    },

    /**
     * ONE scope, and its count is the WHOLE export.
     *
     * An export belongs to the person who dropped it: there is no "shared with
     * me" or "public" half of somebody's Google Takeout, so the surface
     * declares only `mine` rather than rendering four tabs that can never
     * differ. The number on it is the Library's own total, so the tab never
     * restates the filtered number that is already on the toolbar.
     */
    async fetchCounts(): Promise<EntityScopeCounts> {
      const summary = getSummary();
      if (summary) {
        return { byKind: { mine: summary.total_items }, narrow: {} };
      }
      const response = await fetchExportItems(libraryId, { limit: 1 });
      return { byKind: { mine: Number(response.total ?? 0) }, narrow: {} };
    },

    async fetchFacets(): Promise<EntityFacets> {
      const [facets, summary] = await Promise.all([
        fetchExportItemFacets(libraryId),
        Promise.resolve(getSummary()),
      ]);
      return {
        byKind: {
          direction: countsToFacetValues(facets.direction),
          kind: countsToFacetValues(facets.item_kind),
          // Labels, threads/channels and correspondents come from the index
          // summary: the facets endpoint answers two axes, and a filter
          // section with no options would be a declared narrowing the page
          // silently never offers.
          labels: countsToFacetValues(summary?.counts_by_label),
          container_label: countsToFacetValues(summary?.counts_by_container),
          author: (summary?.top_correspondents ?? []).map((c) => ({
            value: c.key,
            count: c.count,
          })),
        },
      };
    },
  };
}
