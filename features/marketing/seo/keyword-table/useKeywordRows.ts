"use client";

/**
 * THE KEYWORD TABLE — the ONE data access system (P28).
 *
 * Every surface that lists keywords reads through this hook. Not "usually" —
 * every one. The topic tree's queues used to run their own RPCs
 * (`gsc_topic_unassigned_keywords`, `gsc_topic_proposed_keywords`), and that
 * second door is exactly why those lists had no sortable clicks, no dimension
 * columns and no filters: a list built on a narrower query can only ever offer
 * a narrower table.
 *
 * The reads, all scoped to the page on screen (THE SCOPE RULE — never the
 * site):
 *   • `seo.gsc_perf_breakdown` — the rows, sorted / filtered / paged SERVER
 *     side. Sorting a 5,823-row list inside the browser is a lie, because the
 *     browser holds fifty of them.
 *   • `gsc_keyword_value_for` — class, score and level.
 *   • `gsc_keyword_topics_for` — which service each keyword maps to, who ruled
 *     it and how sure they were.
 *   • `gsc_keyword_stamps_for` — the dimension columns the user added.
 *   • `facet_dimension_catalog` + the site's topic tree — the filter options.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md (P26 + P28)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useGscBreakdown } from "@/features/marketing/search-console/hooks/useGscQuery";
import {
  getGscKeywordValueFor,
  type GscKeywordValueRow,
} from "@/features/marketing/search-console/data-insights";
import type {
  GscBreakdownRow,
  GscFilters,
  GscResolvedPeriods,
  GscSortKey,
} from "@/features/marketing/search-console/types";
import {
  getFacetDimensionCatalog,
  type FacetDimension,
} from "@/features/marketing/seo/value-system/dimensions/data";
import { getValueVocabulary } from "@/features/marketing/seo/value-system/data";
import { buildBandMeta, type BandMeta } from "@/features/marketing/seo/value-system/lib";
import {
  getKeywordServices,
  getKeywordStamps,
  type KeywordServicePlacement,
  type KeywordStamp,
} from "@/features/marketing/seo/keyword-workbench/data";
import { useSiteServices } from "@/features/marketing/seo/keyword-workbench/hooks/useSiteServices";

/**
 * Sort ids the RPC can honor. Anything else sorts the rows ON SCREEN, and the
 * table says so rather than pretending otherwise.
 */
export const SERVER_SORTABLE = new Set<string>([
  "key",
  "clicks",
  "impressions",
  "ctr",
  "position",
  // THE SERVICE COLUMN sorts on the server or it lies: the browser holds one
  // page, and "sort by service" over 5,823 keywords must mean all of them.
  "topic",
]);

export interface UseKeywordRowsInput {
  siteId: string;
  periods: GscResolvedPeriods;
  filters: GscFilters;
  search: string;
  sort: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
  /** Dimension slugs currently rendered as columns. */
  dimensions: string[];
}

export interface KeywordRowsResult {
  rows: GscBreakdownRow[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
  /** Everything a cell needs, keyed by the row's keyword id. */
  stampFor: (row: GscBreakdownRow, slug: string) => KeywordStamp | undefined;
  valueFor: (row: GscBreakdownRow) => GscKeywordValueRow | undefined;
  serviceFor: (row: GscBreakdownRow) => KeywordServicePlacement | undefined;
  /** The site's dimension catalog — the Columns chooser and filter options. */
  dimensionCatalog: FacetDimension[];
  dimensionCatalogLoading: boolean;
  classDimension: FacetDimension | undefined;
  /** The site's topic tree, for the Service column and its filter. */
  services: ReturnType<typeof useSiteServices>;
  /**
   * The site's OWN value-band ladder. Bands are site-authored
   * (`seo.site_vocabulary`) — All Green calls its top band "Core revenue" —
   * so the Level column's filter options are read, never hardcoded.
   */
  bands: BandMeta[];
  /** Re-read everything a write can change, everywhere it is shown. */
  refreshMeaning: () => Promise<void>;
}

export function useKeywordRows(input: UseKeywordRowsInput): KeywordRowsResult {
  const {
    siteId,
    periods,
    filters,
    search,
    sort,
    sortDir,
    page,
    pageSize,
    dimensions,
  } = input;
  const queryClient = useQueryClient();

  const breakdown = useGscBreakdown(siteId, periods, filters, {
    dimension: "query",
    search,
    sort: SERVER_SORTABLE.has(sort) ? (sort as GscSortKey) : "clicks",
    sortDir,
    page,
    pageSize,
  });
  const rows = breakdown.data?.rows ?? [];
  const total = breakdown.data?.total ?? 0;
  const keywordIds = rows
    .map((r) => r.keyword_id)
    .filter((id): id is string => !!id);

  const catalog = useQuery({
    queryKey: ["marketing", "seo", "dimension-catalog", siteId],
    queryFn: ({ signal }) => getFacetDimensionCatalog(siteId, signal),
    staleTime: 5 * 60_000,
  });
  const dimensionCatalog = catalog.data ?? [];

  const values = useQuery({
    queryKey: ["marketing", "gsc", "keyword-value-for", siteId, keywordIds],
    queryFn: ({ signal }) => getGscKeywordValueFor(siteId, keywordIds, signal),
    enabled: keywordIds.length > 0,
    staleTime: 60_000,
  });

  const services = useSiteServices(
    siteId,
    periods.current.start,
    periods.current.end,
  );
  const placements = useQuery({
    queryKey: ["marketing", "seo", "keyword-services", siteId, keywordIds],
    queryFn: ({ signal }) => getKeywordServices(siteId, keywordIds, signal),
    enabled: keywordIds.length > 0,
    staleTime: 60_000,
  });

  const stamps = useQuery({
    queryKey: [
      "marketing",
      "seo",
      "keyword-stamps",
      siteId,
      keywordIds,
      dimensions,
    ],
    queryFn: ({ signal }) =>
      getKeywordStamps(siteId, keywordIds, dimensions, signal),
    enabled: keywordIds.length > 0 && dimensions.length > 0,
    staleTime: 60_000,
  });

  const vocabulary = useQuery({
    queryKey: ["seo", "value", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
    staleTime: 5 * 60_000,
  });

  const refreshMeaning = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "keyword-stamps", siteId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "gsc", "keyword-value-for", siteId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "dimension-catalog", siteId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "keyword-services", siteId],
    });
    // A placement changes which keywords are unplaced, which proposals are
    // still waiting, and what the tree counts — never leave that stale.
    await queryClient.invalidateQueries({ queryKey: ["marketing", "gsc", "breakdown"] });
    await queryClient.invalidateQueries({ queryKey: ["seo", "topics"] });
  };

  return {
    rows,
    total,
    isLoading: breakdown.isLoading,
    isFetching:
      breakdown.isFetching ||
      values.isFetching ||
      stamps.isFetching ||
      placements.isFetching,
    error: breakdown.isError ? breakdown.error : null,
    refetch: () => void breakdown.refetch(),
    stampFor: (row, slug) =>
      row.keyword_id ? stamps.data?.get(row.keyword_id)?.get(slug) : undefined,
    valueFor: (row) =>
      row.keyword_id ? values.data?.get(row.keyword_id) : undefined,
    serviceFor: (row) =>
      row.keyword_id ? placements.data?.get(row.keyword_id) : undefined,
    dimensionCatalog,
    dimensionCatalogLoading: catalog.isLoading,
    classDimension: dimensionCatalog.find((d) => d.slug === "traffic_class"),
    services,
    bands: buildBandMeta(vocabulary.data ?? []),
    refreshMeaning,
  };
}
