/**
 * MULTI-LOCATION LOCAL (C10) — data layer.
 *
 * READS ARE THE SERVER'S ANSWERS, NEVER RECOMPOSED HERE. Attribution lives in
 * `seo.gsc_keyword_locations`; the decomposition in `seo.gsc_perf_location_summary`;
 * the gauge in `seo.gsc_location_readiness`; and the keywords behind one row in
 * `seo.gsc_location_keywords`. The client's whole job is to render them and to
 * open the door each one implies.
 *
 * WHY THE KEYWORD DRILL-IN IS A SERVER READ: the generic `gsc_perf_breakdown`
 * caps at 1,000 rows and cannot filter by location, so intersecting it in the
 * browser would have truncated a location's keyword list while looking complete.
 * A silent cap is worse than a missing feature.
 *
 * THE LOCATION ROWS THEMSELVES come from the ONE business-location read that
 * already exists (`features/marketing/data/service.ts` — `listBusinessLocations`
 * / `createBusinessLocation`). This module does not open a second path to
 * `web.business_location`.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md § C10.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";
import type {
  KeywordLocationRow,
  LocationBucket,
  LocationKeywordRow,
  LocationReadinessRow,
  LocationSummaryRow,
} from "./types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("read your locations");

// ── Query keys ──────────────────────────────────────────────────────────────

export const locationSummaryQueryKey = (
  siteId: string,
  start: string,
  end: string,
) => ["seo", "locations", "summary", siteId, start, end] as const;

export const locationReadinessQueryKey = (siteId: string) =>
  ["seo", "locations", "readiness", siteId] as const;

export const keywordLocationsQueryKey = (siteId: string, keywordIds: string[]) =>
  ["seo", "locations", "keyword", siteId, [...keywordIds].sort().join("|")] as const;

export const locationKeywordsQueryKey = (
  siteId: string,
  locationId: string | null,
  bucket: LocationBucket | null,
  start: string,
  end: string,
  page: number,
) =>
  [
    "seo",
    "locations",
    "keywords",
    siteId,
    locationId ?? bucket ?? "all",
    start,
    end,
    page,
  ] as const;

/** Every key this feature owns — invalidate them all after a binding changes. */
export function locationSurfaceQueryKeys(siteId: string) {
  return [
    ["seo", "locations", "summary", siteId],
    ["seo", "locations", "readiness", siteId],
    ["seo", "locations", "keyword", siteId],
    ["seo", "locations", "keywords", siteId],
  ];
}

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * Traffic decomposed by location, with compare. Includes the two explicit
 * buckets — "Local — location not resolved" and "Not location-specific" —
 * because a decomposition that hides its remainder is a lie about coverage.
 */
export async function getLocationSummary(
  siteId: string,
  start: string,
  end: string,
  compareStart: string | null,
  compareEnd: string | null,
  signal?: AbortSignal,
): Promise<LocationSummaryRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_perf_location_summary", {
      p_site_id: siteId,
      p_start: start,
      p_end: end,
      // The RPC's compare bounds are optional-not-nullable in the generated
      // Args; it also refuses one without the other, so they travel together.
      ...(compareStart && compareEnd
        ? { p_compare_start: compareStart, p_compare_end: compareEnd }
        : {}),
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/** What is stopping attribution from working, named exactly. */
export async function getLocationReadiness(
  siteId: string,
  signal?: AbortSignal,
): Promise<LocationReadinessRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_location_readiness", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/**
 * Which location these keywords belong to, and how that was decided. Keywords
 * with no answer are ABSENT from the result — never guessed, never defaulted.
 * The RPC refuses more than 5,000 ids: ask for the keywords you are showing.
 */
export async function getKeywordLocations(
  siteId: string,
  keywordIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, KeywordLocationRow>> {
  if (keywordIds.length === 0) return new Map();
  const response = await (await seoDb())
    .rpc("gsc_keyword_locations", {
      p_site_id: siteId,
      p_keyword_ids: keywordIds,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return new Map(rows.map((row) => [row.keyword_id, row]));
}

export interface LocationKeywordsPage {
  rows: LocationKeywordRow[];
  total: number;
}

/** The keywords behind ONE decomposition row, paged server-side. */
export async function getLocationKeywords(
  siteId: string,
  locationId: string | null,
  bucket: LocationBucket | null,
  start: string,
  end: string,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<LocationKeywordsPage> {
  const response = await (await seoDb())
    .rpc("gsc_location_keywords", {
      p_site_id: siteId,
      ...(locationId ? { p_location_id: locationId } : {}),
      ...(!locationId && bucket ? { p_bucket: bucket } : {}),
      p_start: start,
      p_end: end,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}
