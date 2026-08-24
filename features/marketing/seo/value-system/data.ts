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
import { extractErrorMessage, makeAssertData } from "@/utils/errors";
import type { Json } from "@/types/database.types";
import type {
  BandPreviewRow,
  FacetUsageRow,
  RegistryDimension,
  RegistryEntry,
  SiteGeoArea,
  SiteTopicValue,
  StarterPackAdoption,
  StarterPackAdoptResult,
  StarterPackDetail,
  StarterPackPart,
  StarterPackPreview,
  StarterPackSiteStatus,
  StarterPackSummary,
  TopicNode,
  ValueBandDef,
  ValueReviewQuery,
  ValueReviewRow,
  ValueRule,
  ValueSummaryRow,
  VocabKind,
  VocabularyDraftRow,
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
  return assertGoverned(response.data, response.error, "save the ruling");
}

/**
 * What is UNFINISHED about this site's own meaning setup — measured, never
 * guessed and never scored.
 *
 * `seo.gsc_site_meaning_health` counts metadata only (no corpus scan, no
 * resolver call, ~88ms). It returns sentences already written for a
 * non-technical reader, so the UI renders `headline` and `detail` verbatim —
 * paraphrasing them here would fork the copy from the rule that produced it.
 *
 * `severity`:
 *   inert — expressed but doing nothing. The worst state, because it LOOKS
 *           configured (4 service areas that match no place name).
 *   gap   — never expressed at all.
 *   ok    — working; reported so the screen can be honest about what IS done.
 */
export type MeaningHealthArea =
  | "geo"
  | "rules"
  | "topics"
  | "dimensions"
  | "bands";
export type MeaningHealthSeverity = "inert" | "gap" | "ok";

export interface MeaningHealthRow {
  area: MeaningHealthArea;
  severity: MeaningHealthSeverity;
  headline: string;
  detail: string;
  count_value: number;
}

export async function getSiteMeaningHealth(
  siteId: string,
  signal?: AbortSignal,
): Promise<MeaningHealthRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_site_meaning_health", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as MeaningHealthRow[];
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
    .select(
      "id, site_id, label, area_kind, match_tokens, place_ids, location_ids, geo_band, notes, metadata",
    )
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("label");
  return (assertData(response.data, response.error) as unknown as SiteGeoArea[]).map(
    (row) => ({
      ...row,
      metadata: row.metadata ?? {},
      // NULL and "{}" mean the same thing to a reader: not bound to anything.
      location_ids: row.location_ids ?? [],
    }),
  );
}

/** Rules with a value effect (the qualifier ledger). Site rules only — value
 *  rules resolve LIVE, unlike class rules which materialize rulings. */
export async function listValueRules(siteId: string): Promise<ValueRule[]> {
  const response = await (await seoDb())
    .from("keyword_class_rule")
    .select(
      "id, name, description, pattern, match_kind, match_facet, match_facet_value, target_class, value_multiplier, site_id, notes, metadata",
    )
    .eq("site_id", siteId)
    .not("value_multiplier", "is", null)
    .is("deleted_at", null)
    .order("name");
  return (assertData(response.data, response.error) as unknown as ValueRule[]).map((row) => ({
    ...row,
    metadata: row.metadata ?? {},
  }));
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

/**
 * Governance rules speak for themselves.
 *
 * `assertData` deliberately replaces PostgREST prose with one calm sentence,
 * because RLS codes and planner errors are noise to a person. But the
 * vocabulary RPCs raise sentences WRITTEN for the person reading them — "3
 * keyword rulings are set to Bronze, choose where they move before removing
 * it", "widen keyword_audience_type_check in the same change". Swallowing
 * those turns the rule into a mystery, which is the exact failure this whole
 * feature exists to prevent.
 *
 * So: a raise whose message starts with one of OUR governance codes is passed
 * through verbatim; everything else still gets the generic sentence.
 */
const GOVERNANCE_CODE =
  /^(gsc_vocab_[a-z_]+|gsc_bad_vocab_kind|gsc_unknown_value_band|gsc_no_keywords|gsc_site_[a-z_]+|seo_registry_[a-z_]+|seo_dimension_[a-z_]+|seo_value_[a-z_]+|seo_platform_dimension_readonly):\s*/;

function assertGoverned<T>(data: T | null, error: unknown, action: string): T {
  if (error) {
    const message = extractErrorMessage(error).split(" · ")[0];
    const governed = message.match(GOVERNANCE_CODE);
    if (governed) {
      throw new Error(message.slice(governed[0].length), { cause: error });
    }
  }
  return assertData(data, error, action) as T;
}

// ── Vocabulary governance ───────────────────────────────────────────────────
//
// THE SITE PLANE. A site starts on the platform starter template and ADOPTS it
// the first time it wants its own meaning; from then on its rows REPLACE the
// template set entirely. Coherence (unique names, distinct thresholds, a band
// that starts at 0, the reserved slugs) is enforced in the DB by
// seo.gsc_assert_vocabulary_coherent — never re-implemented here, because a
// UI-only check is not a rule.

/** Copy the platform template into this site so it can be edited. Idempotent. */
export async function adoptValueVocabulary(
  siteId: string,
  kind: VocabKind,
): Promise<ValueBandDef[]> {
  const response = await (await seoDb()).rpc("gsc_adopt_value_vocabulary", {
    p_site_id: siteId,
    p_kind: kind,
  });
  return assertGoverned(response.data, response.error, "adopt the starter set") as ValueBandDef[];
}

/**
 * Replace the WHOLE vocabulary. `reassign` maps an identity being removed to a
 * surviving one — without it the DB refuses to drop a band that still carries
 * expert rulings, which is the behaviour we want.
 */
export async function saveValueVocabulary(
  siteId: string,
  kind: VocabKind,
  rows: VocabularyDraftRow[],
  reassign: Record<string, string> = {},
): Promise<ValueBandDef[]> {
  const response = await (await seoDb()).rpc("gsc_save_value_vocabulary", {
    p_site_id: siteId,
    p_kind: kind,
    p_rows: rows as unknown as Json,
    p_reassign: reassign as unknown as Json,
  });
  return assertGoverned(response.data, response.error, "save that vocabulary") as ValueBandDef[];
}

/** Hand the vocabulary back to the platform template. */
export async function resetValueVocabulary(
  siteId: string,
  kind: VocabKind,
  reassign: Record<string, string> = {},
): Promise<ValueBandDef[]> {
  const response = await (await seoDb()).rpc("gsc_reset_value_vocabulary", {
    p_site_id: siteId,
    p_kind: kind,
    p_reassign: reassign as unknown as Json,
  });
  return assertGoverned(response.data, response.error, "restore the platform defaults") as ValueBandDef[];
}

/**
 * What a PROPOSED band set does to this site's real keywords, before anything
 * is saved. Banded server-side on purpose — a band is never re-derived on the
 * client (value-system.md, law 3).
 */
export async function previewValueBands(
  siteId: string,
  rows: VocabularyDraftRow[],
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<BandPreviewRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_value_band_preview", {
      p_site_id: siteId,
      p_rows: rows as unknown as Json,
      p_start: start,
      p_end: end,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(response.data, response.error, "preview those bands") as BandPreviewRow[];
}

// ── Platform plane (platform.categories) ────────────────────────────────────
//
// The universal facet registry and the band starter templates. Readable by any
// authenticated user — the labels agents apply must be visible to the humans
// they are applied to. Writable by super admins only, through the same RPCs.

export async function listVocabularyRegistry(
  dimension: RegistryDimension,
  signal?: AbortSignal,
): Promise<RegistryEntry[]> {
  const response = await (await seoDb())
    .rpc("vocabulary_registry_list", { p_dimension: dimension })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as RegistryEntry[];
}

/** How many keywords carry each facet value — why a value is never just deleted. */
export async function getFacetRegistryUsage(
  signal?: AbortSignal,
): Promise<FacetUsageRow[]> {
  const response = await (await seoDb())
    .rpc("facet_registry_usage")
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as FacetUsageRow[];
}

/** Rename / re-describe one registry entry. Label and description only. */
export async function updateVocabularyRegistryEntry(
  id: string,
  label: string,
  description: string | null,
) {
  const response = await (await seoDb()).rpc("vocabulary_registry_update", {
    p_id: id,
    p_label: label,
    p_description: description ?? undefined,
  });
  return assertGoverned(response.data, response.error, "update the vocabulary");
}

/**
 * Add a facet VALUE. The DB refuses until seo.keyword's CHECK constraint
 * accepts it: a registry label for a value the classifier can never write is
 * a lie, so the constraint widening ships in the same change.
 */
export async function addFacetRegistryValue(
  facet: string,
  value: string,
  label: string,
  description: string | null,
) {
  const response = await (await seoDb()).rpc("facet_registry_add_value", {
    p_facet: facet,
    p_value: value,
    p_label: label,
    p_description: description ?? undefined,
  });
  return assertGoverned(response.data, response.error, "add that value");
}

// ── Industry starter packs (D36) ────────────────────────────────────────────
// Packs are platform-global template rows, so every read and the one write go
// through SECURITY DEFINER RPCs — the same posture as gsc_value_vocabulary.

export const starterPackCatalogQueryKey = ["seo", "starter-packs"] as const;
export const starterPackDetailQueryKey = (packId: string) =>
  ["seo", "starter-pack", packId] as const;

/**
 * The catalog, ordered for THIS org: packs for an industry the org has opted
 * into (`iam.org_industries`) first, then ratified before proposed, then by
 * name. `org_match` is server truth, never re-derived here.
 */
export async function getStarterPackCatalog(
  status?: string | null,
  organizationId?: string | null,
  signal?: AbortSignal,
): Promise<StarterPackSummary[]> {
  const response = await (await seoDb())
    .rpc("starter_pack_catalog", {
      p_status: status ?? undefined,
      p_organization_id: organizationId ?? undefined,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as StarterPackSummary[];
}

export const starterPackAdoptionsQueryKey = (siteId: string) =>
  ["seo", "starter-pack-adoptions", siteId] as const;
export const starterPackStatusQueryKey = (siteId: string, packId: string) =>
  ["seo", "starter-pack-status", siteId, packId] as const;
export const starterPackPreviewQueryKey = (
  siteId: string,
  packId: string,
  start: string,
  end: string,
  ruleIds: string[] | null,
  itemIds: string[] | null,
) =>
  [
    "seo",
    "starter-pack-preview",
    siteId,
    packId,
    start,
    end,
    ruleIds ? [...ruleIds].sort().join("|") : "*",
    itemIds ? [...itemIds].sort().join("|") : "*",
  ] as const;

/** One receipt per pack this site has adopted anything from. */
export async function getStarterPackAdoptions(
  siteId: string,
  signal?: AbortSignal,
): Promise<StarterPackAdoption[]> {
  const response = await (await seoDb())
    .rpc("starter_pack_site_adoptions", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as StarterPackAdoption[];
}

/** Per item: missing / as adopted / changed / archived, pack value beside site value. */
export async function getStarterPackSiteStatus(
  siteId: string,
  packId: string,
  signal?: AbortSignal,
): Promise<StarterPackSiteStatus> {
  const response = await (await seoDb())
    .rpc("starter_pack_site_status", { p_site_id: siteId, p_pack_id: packId })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as unknown as StarterPackSiteStatus;
}

/**
 * What adopting the SELECTED parts of a pack would do to this site's keywords
 * in the review window — server-measured by the one resolver, never estimated
 * here. `ruleIds` / `itemIds` null = the whole pack.
 */
export async function previewStarterPack(
  siteId: string,
  packId: string,
  start: string,
  end: string,
  ruleIds: string[] | null,
  itemIds: string[] | null,
  signal?: AbortSignal,
): Promise<StarterPackPreview> {
  const response = await (await seoDb())
    .rpc("starter_pack_preview", {
      p_site_id: siteId,
      p_pack_id: packId,
      p_start: start,
      p_end: end,
      ...(ruleIds ? { p_rule_ids: ruleIds } : {}),
      ...(itemIds ? { p_item_ids: itemIds } : {}),
      p_sample: 3,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as unknown as StarterPackPreview;
}

export async function getStarterPackDetail(
  packId: string,
  signal?: AbortSignal,
): Promise<StarterPackDetail> {
  const response = await (await seoDb())
    .rpc("starter_pack_detail", { p_pack_id: packId })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as unknown as StarterPackDetail;
}

/**
 * THE one adoption path. Copy-insert, additive, idempotent — a site's own
 * rows are never overwritten, and re-adopting writes only what is missing.
 *
 * `geoPlaceIds` maps a pack geo-area item id to gazetteer places (`seo.geo_place`
 * — preferred, because a place carries its state, its aliases and its ambiguity
 * rule) and `geoPlaces` to typed words, for the names the gazetteer has never
 * heard of.
 * A pack ships geo areas as archetypes with no places in them, so adopting
 * without this writes labelled shells that match nothing — the RPC stamps
 * those `metadata.places_pending` and reports them in `geo_areas_pending` so
 * the screens can put a door in front of them. Passing places for an area the
 * site already has but never filled FILLS it (that is "writing only what is
 * missing"); an area that already carries places is the site's own ruling and
 * is never touched.
 */
export interface AdoptStarterPackOptions {
  /** Which parts to touch at all (default: every part). */
  parts?: StarterPackPart[];
  /** Pack geo-area item id → typed words. */
  geoPlaces?: Record<string, string[]>;
  /** Pack geo-area item id → gazetteer place ids (preferred). */
  geoPlaceIds?: Record<string, string[]>;
  /** Starter-pack item ids to adopt (topics, bands, geo bands, areas). undefined = all. */
  itemIds?: string[];
  /** Template rule ids to adopt. undefined = all. */
  ruleIds?: string[];
  /** Seed the pack's guidelines when the site has none (default true). */
  seedGuidelines?: boolean;
  /**
   * RESET mode (P13's "re-apply is a button"): rows that still carry this
   * pack's provenance are put back to the pack's values, archived ones revived.
   * Rows the site authored are never touched; places are never reset. Combine
   * with `itemIds` / `ruleIds` to reset only what the person ticked.
   */
  reset?: boolean;
}

export async function adoptStarterPack(
  siteId: string,
  packId: string,
  options: AdoptStarterPackOptions = {},
): Promise<StarterPackAdoptResult> {
  const { parts, geoPlaces, geoPlaceIds, itemIds, ruleIds, seedGuidelines, reset } = options;
  // SUBSCRIBE IS ADOPT (D2, 2026-08-22): the ONE Library write. The RPC records the
  // org subscription on platform.entity_grants (the site's org is derived from the
  // site), checks entitlement (industry opt-in / global / pilot grant), then runs the
  // materializer — the former public `seo.adopt_starter_pack`, now internal.
  const target: Record<string, Json> = {
    site_id: siteId,
    ...(parts && parts.length ? { include: parts } : {}),
    ...(geoPlaces && Object.keys(geoPlaces).length
      ? { geo_places: geoPlaces as unknown as Json }
      : {}),
    ...(geoPlaceIds && Object.keys(geoPlaceIds).length
      ? { geo_place_ids: geoPlaceIds as unknown as Json }
      : {}),
    ...(itemIds ? { item_ids: itemIds } : {}),
    ...(ruleIds ? { rule_ids: ruleIds } : {}),
    ...(seedGuidelines === false ? { seed_guidelines: false } : {}),
    ...(reset ? { reset: true } : {}),
  };
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase.rpc("library_subscribe", {
    p_entity_type: "seo_starter_pack",
    p_entity_id: packId,
    p_target: target,
  });
  return assertData(response.data, response.error) as unknown as StarterPackAdoptResult;
}

// ── The ruling counter (the KPI that only YOU can move) ─────────────────────

export interface RulingCounts {
  /** Every keyword on this site carrying an explicit expert tier ruling. */
  total: number;
  /** How many of those were set or changed in the last 7 days. */
  thisWeek: number;
}

/**
 * Counts only — `head: true`, so nothing is fetched and the 1000-row PostgREST
 * cap can never make this lie (the `readAllRows` law's other half: when you
 * want a number, ask for a number).
 *
 * This is the one number on the workbench that no arithmetic can move for you.
 * That is exactly why it is a KPI: it counts the expert's own contribution,
 * and it is the number a person watches go up.
 */
export async function getRulingCounts(
  siteId: string,
  signal?: AbortSignal,
): Promise<RulingCounts> {
  const db = await seoDb();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const base = () =>
    db
      .from("site_keyword_value")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .not("value_tier", "is", null)
      .is("deleted_at", null)
      .abortSignal(signal ?? new AbortController().signal);
  const [all, week] = await Promise.all([
    base(),
    base().gte("updated_at", since),
  ]);
  if (all.error) throw all.error;
  if (week.error) throw week.error;
  return { total: all.count ?? 0, thisWeek: week.count ?? 0 };
}
