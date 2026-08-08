/**
 * Keyword-classification data access — the review read
 * (`seo.gsc_keyword_class_review`) and THE one human write path for class
 * overrides (`seo.gsc_set_keyword_class`). Both RPCs live in
 * `migrations/seo_keyword_classification_ui.sql` and follow the mandatory
 * SECURITY DEFINER + access-assert pattern. The class→column mapping is
 * server-side ONLY — never derive or write valuation columns client-side.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type {
  GscClassReviewRow,
  GscClassSource,
  GscDateRange,
  GscSetKeywordClassRow,
  GscTrafficClass,
} from "@/features/marketing/search-console/types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data");
  return data;
}

export interface GscClassReviewQuery {
  trafficClasses: GscTrafficClass[] | null;
  sources: GscClassSource[] | null;
  search: string;
  sort: "impressions" | "clicks" | "ctr" | "query";
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface GscClassReviewPage {
  rows: GscClassReviewRow[];
  total: number;
}

export async function getGscClassReview(
  siteId: string,
  range: GscDateRange,
  query: GscClassReviewQuery,
  signal?: AbortSignal,
): Promise<GscClassReviewPage> {
  const response = await (await seoDb())
    .rpc("gsc_keyword_class_review", {
      p_site_id: siteId,
      p_start: range.start,
      p_end: range.end,
      p_classes: query.trafficClasses?.length ? query.trafficClasses : undefined,
      p_sources: query.sources?.length ? query.sources : undefined,
      p_search: query.search.trim() || undefined,
      p_sort: query.sort,
      p_sort_dir: query.sortDir,
      p_limit: query.pageSize,
      p_offset: (query.page - 1) * query.pageSize,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/** A human class ruling. `clear` removes the override so the machine rungs
 *  (brand match / AI intent) decide again. */
export type GscClassRuling = Exclude<GscTrafficClass, "unclassified"> | "clear";

/**
 * Apply one ruling to one or many keywords. Notes are REQUIRED for mismatch
 * (enforced server-side too — a mismatch ruling must carry its case).
 * Returns the RESOLVED (class, class_source) per keyword from the server so
 * callers show the flip to `site_value` from truth, never assumption.
 */
export async function setGscKeywordClass(
  siteId: string,
  keywordIds: string[],
  ruling: GscClassRuling,
  notes: string | null,
): Promise<GscSetKeywordClassRow[]> {
  const response = await (await seoDb()).rpc("gsc_set_keyword_class", {
    p_site_id: siteId,
    p_keyword_ids: keywordIds,
    p_class: ruling,
    p_notes: notes?.trim() || undefined,
  });
  return assertData(response.data, response.error);
}
