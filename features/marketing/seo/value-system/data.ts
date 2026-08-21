/**
 * Keyword Value System — data layer. Direct Supabase, SECURITY DEFINER RPCs
 * only for anything that touches GSC facts or scans the keyword corpus (the
 * 2026-08-07 timeout law); small site-scoped tables read/write directly under
 * RLS. ONE write path for tier rulings: seo.gsc_set_keyword_value. Never
 * re-derive a band or a score client-side — render what the resolver returns.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";
import type {
  SiteGeoArea,
  SiteTopicValue,
  TopicNode,
  ValueBandDef,
  ValueReviewQuery,
  ValueReviewRow,
  ValueRule,
  ValueSummaryRow,
} from "./types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your keyword value data");

/** Effective vocabulary: the site's rows when any exist, else the platform template. */
export async function getValueVocabulary(
  siteId: string,
  kind: "value_band" | "geo_band",
  signal?: AbortSignal,
): Promise<ValueBandDef[]> {
  const response = await (await seoDb())
    .rpc("gsc_value_vocabulary", { p_site_id: siteId, p_kind: kind })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as ValueBandDef[];
}

/** The headline decomposition: GSC clicks/impressions/queries per value band. */
export async function getValueSummary(
  siteId: string,
  start: string,
  end: string,
  compareStart?: string | null,
  compareEnd?: string | null,
  signal?: AbortSignal,
): Promise<ValueSummaryRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_perf_value_summary", {
      p_site_id: siteId,
      p_start: start,
      p_end: end,
      ...(compareStart && compareEnd
        ? { p_compare_start: compareStart, p_compare_end: compareEnd }
        : {}),
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as ValueSummaryRow[];
}

/** The workbench listing: GSC-active keywords with value band, score, source, reasons, class, volume. */
export async function getValueReview(
  siteId: string,
  start: string,
  end: string,
  query: ValueReviewQuery = {},
  signal?: AbortSignal,
): Promise<{ rows: ValueReviewRow[]; total: number }> {
  const response = await (await seoDb())
    .rpc("gsc_keyword_value_review", {
      p_site_id: siteId,
      p_start: start,
      p_end: end,
      p_band: query.band ?? undefined,
      p_source: query.source ?? undefined,
      p_search: query.search ?? undefined,
      p_sort: query.sort ?? "clicks",
      p_sort_dir: query.sortDir ?? "desc",
      p_limit: query.limit ?? 50,
      p_offset: query.offset ?? 0,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error) as ValueReviewRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/** THE one write path for tier rulings. tier=null clears back to computed/unvalued. */
export async function setKeywordValue(
  siteId: string,
  keywordIds: string[],
  tier: string | null,
  notes?: string,
): Promise<Array<{ keyword_id: string; value_band: string; value_source: string }>> {
  const response = await (await seoDb()).rpc("gsc_set_keyword_value", {
    p_site_id: siteId,
    p_keyword_ids: keywordIds,
    p_value_tier: tier ?? undefined,
    p_notes: notes ?? undefined,
  });
  return assertData(response.data, response.error);
}

// ── Site meaning tables (small, site-scoped, direct under RLS) ──────────────

export async function listSiteVocabulary(siteId: string, kind: "value_band" | "geo_band") {
  const response = await (await seoDb())
    .from("site_vocabulary")
    .select("id, vocab_kind, value, label, description, sort, config, active")
    .eq("site_id", siteId)
    .eq("vocab_kind", kind)
    .is("deleted_at", null)
    .order("sort");
  return assertData(response.data, response.error);
}

export async function listGeoAreas(siteId: string): Promise<SiteGeoArea[]> {
  const response = await (await seoDb())
    .from("site_geo_area")
    .select("id, site_id, label, area_kind, match_tokens, geo_band, notes")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("label");
  return assertData(response.data, response.error) as unknown as SiteGeoArea[];
}

/** Rules with a value effect (the qualifier ledger). Site rules only — value
 *  rules resolve LIVE, unlike class rules which materialize rulings. */
export async function listValueRules(siteId: string): Promise<ValueRule[]> {
  const response = await (await seoDb())
    .from("keyword_class_rule")
    .select(
      "id, name, description, pattern, match_kind, match_facet, match_facet_value, target_class, value_multiplier, site_id, notes",
    )
    .eq("site_id", siteId)
    .not("value_multiplier", "is", null)
    .is("deleted_at", null)
    .order("name");
  return assertData(response.data, response.error) as ValueRule[];
}

/** Topics that carry a per-site worth row, with their nodes (the tree's valued spine). */
export async function listSiteTopicValues(
  siteId: string,
): Promise<{ values: SiteTopicValue[]; topics: TopicNode[] }> {
  const db = await seoDb();
  const valuesRes = await db
    .from("site_topic_value")
    .select("id, site_id, topic_id, weight, lead_quality, service_match, notes")
    .eq("site_id", siteId)
    .is("deleted_at", null);
  const values = assertData(valuesRes.data, valuesRes.error) as SiteTopicValue[];
  const topicsRes = await db
    .from("topic")
    .select("id, name, slug, node_type, parent_id, description")
    .is("deleted_at", null);
  const topics = assertData(topicsRes.data, topicsRes.error) as TopicNode[];
  return { values, topics };
}
