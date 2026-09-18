"use client";

/**
 * THE KEYWORD TABLE — the ONE data access system (P28).
 *
 * Every surface that lists keywords reads through this hook. Not "usually" —
 * every one. A list built on a narrower query can only ever offer a narrower
 * table.
 *
 * The reads, all scoped to the page on screen (THE SCOPE RULE — never the
 * site):
 *   • `seo.gsc_perf_breakdown` — the rows, sorted / filtered / paged SERVER
 *     side. Sorting a 5,823-row list inside the browser is a lie, because the
 *     browser holds fifty of them.
 *   • `gsc_keyword_value_for` — class, score and level.
 *   • `gsc_keyword_offerings_for` — which of this site's offerings each keyword
 *     maps to, who placed it and how sure they were.
 *   • `gsc_keyword_stamps_for` — the dimension columns the user added.
 *   • `facet_dimension_catalog` + the site's offerings — the filter options.
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
  getKeywordOfferings,
  getKeywordStamps,
  KEYWORD_OFFERINGS_KEY,
  type KeywordOfferingPlacement,
  type KeywordStamp,
} from "@/features/marketing/seo/keyword-workbench/data";
import {
  getKeywordLocations,
  keywordLocationsQueryKey,
} from "@/features/marketing/seo/value-system/locations/data";
import { listBusinessLocations } from "@/features/marketing/data/service";
import type { BusinessLocation } from "@/features/marketing/types";
import type { KeywordLocationRow } from "@/features/marketing/seo/value-system/locations/types";
import {
  SITE_OFFERINGS_KEY,
  useSiteOfferings,
  type SiteOfferings,
} from "@/features/marketing/seo/keyword-workbench/hooks/useSiteOfferings";

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
  // THE OFFERING COLUMN (id `topic`, see `OFFERING_COLUMN_ID`) sorts on the
  // server or it lies: "sort by offering" over 5,823 keywords must mean all of them.
  "topic",
]);

/** A table column id → the sort key the RPC understands. */
export function toServerSort(sort: string): GscSortKey {
  if (sort === "topic") return "offering";
  return SERVER_SORTABLE.has(sort) ? (sort as GscSortKey) : "clicks";
}

export interface UseKeywordRowsInput {
  siteId: string;
  /**
   * The site's brand — business locations hang off the BRAND, not the site,
   * because one company's branches serve every one of its sites. Optional so a
   * surface that genuinely has no brand in hand still gets a table; the
   * Location column simply has nothing to offer there.
   */
  brandId?: string | null;
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
  offeringFor: (row: GscBreakdownRow) => KeywordOfferingPlacement | undefined;
  /**
   * C10 — WHICH business location this keyword belongs to, and how that was
   * decided. `undefined` means the server had no answer, which is never the
   * same as "no location".
   */
  locationFor: (row: GscBreakdownRow) => KeywordLocationRow | undefined;
  /** True once the attribution read has resolved, so the cell can wait rather than lie. */
  locationsReady: boolean;
  /**
   * The brand's business locations — the Location column's filter options.
   * EMPTY IS A REAL ANSWER.
   */
  brandLocations: BusinessLocation[];
  /** The site's dimension catalog — the Columns chooser and filter options. */
  dimensionCatalog: FacetDimension[];
  dimensionCatalogLoading: boolean;
  classDimension: FacetDimension | undefined;
  /** This site's offerings, for the Offering column and its filter. */
  offerings: SiteOfferings;
  /**
   * The site's OWN value-band ladder. Bands are site-authored
   * (`seo.site_vocabulary`), so the Level column's filter options are read,
   * never hardcoded.
   */
  bands: BandMeta[];
  /** Re-read everything a write can change, everywhere it is shown. */
  refreshMeaning: () => Promise<void>;
}

export function useKeywordRows(input: UseKeywordRowsInput): KeywordRowsResult {
  const {
    siteId,
    brandId,
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
    sort: toServerSort(sort),
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

  const offerings = useSiteOfferings(
    siteId,
    periods.current.start,
    periods.current.end,
  );
  const placements = useQuery({
    queryKey: [...KEYWORD_OFFERINGS_KEY, siteId, keywordIds],
    queryFn: ({ signal }) => getKeywordOfferings(siteId, keywordIds, signal),
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

  /**
   * C10 — the attribution for the keywords ON SCREEN. Scoped to the page, like
   * every other side read here.
   */
  const locations = useQuery({
    queryKey: keywordLocationsQueryKey(siteId, keywordIds, true),
    queryFn: ({ signal }) =>
      getKeywordLocations(siteId, keywordIds, signal, true),
    enabled: keywordIds.length > 0,
    staleTime: 60_000,
  });

  /** The brand's locations — read from the ONE business-location list. */
  const brandLocations = useQuery({
    queryKey: ["marketing", "brand", "locations", brandId],
    queryFn: ({ signal }) => listBusinessLocations(brandId as string, signal),
    enabled: !!brandId,
    staleTime: 5 * 60_000,
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
      queryKey: [...KEYWORD_OFFERINGS_KEY, siteId],
    });
    // C10 — binding an area to a location re-decides every local keyword.
    await queryClient.invalidateQueries({
      queryKey: ["seo", "locations", "keyword", siteId],
    });
    // A placement changes which keywords are unplaced, which proposals are
    // still waiting, and what the offerings count — never leave that stale.
    await queryClient.invalidateQueries({ queryKey: ["marketing", "gsc", "breakdown"] });
    await queryClient.invalidateQueries({ queryKey: SITE_OFFERINGS_KEY });
  };

  return {
    rows,
    total,
    isLoading: breakdown.isLoading,
    isFetching:
      breakdown.isFetching ||
      values.isFetching ||
      stamps.isFetching ||
      placements.isFetching ||
      locations.isFetching,
    error: breakdown.isError ? breakdown.error : null,
    refetch: () => void breakdown.refetch(),
    stampFor: (row, slug) =>
      row.keyword_id ? stamps.data?.get(row.keyword_id)?.get(slug) : undefined,
    valueFor: (row) =>
      row.keyword_id ? values.data?.get(row.keyword_id) : undefined,
    offeringFor: (row) =>
      row.keyword_id ? placements.data?.get(row.keyword_id) : undefined,
    locationFor: (row) =>
      row.keyword_id ? locations.data?.get(row.keyword_id) : undefined,
    locationsReady: keywordIds.length === 0 || locations.isSuccess,
    brandLocations: brandLocations.data ?? [],
    dimensionCatalog,
    dimensionCatalogLoading: catalog.isLoading,
    classDimension: dimensionCatalog.find((d) => d.slug === "traffic_class"),
    offerings,
    bands: buildBandMeta(vocabulary.data ?? []),
    refreshMeaning,
  };
}
