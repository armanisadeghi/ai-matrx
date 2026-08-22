/**
 * Keyword Value System — client types.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
 * (read it before touching this feature in ANY repo). The three laws:
 * facts are universal; meaning is local; the expert override always wins.
 * Every tier carries its `reasons` — a tier without its why never renders.
 * 'negative' and 'unvalued' are RESERVED band slugs emitted by the resolver.
 */

export interface ValueBandDef {
  value: string;
  label: string;
  description: string | null;
  sort: number;
  /** value_band: { min_score?, color?, negative? } · geo_band: { multiplier?, color? } */
  config: Record<string, unknown>;
  /** True when served from the platform starter template (site has no rows yet). */
  is_template: boolean;
}

export type ValueSource = "override" | "computed" | "unvalued";

export type ValueReason =
  | { kind: "override" }
  | { kind: "topic"; topic: string; weight: number; root: string | null; negative_guard: boolean }
  | { kind: "default_base"; weight: number }
  | { kind: "rule"; rule_id: string; name: string; multiplier: number }
  | { kind: "geo"; band: string; area: string; multiplier: number };

export interface ValueSummaryRow {
  value_band: string;
  value_source: ValueSource;
  clicks: number;
  impressions: number;
  queries: number;
  cmp_clicks: number;
  cmp_impressions: number;
  cmp_queries: number;
}

export interface ValueReviewRow {
  keyword_id: string;
  keyword: string;
  value_band: string;
  value_score: number | null;
  value_source: ValueSource;
  reasons: ValueReason[];
  traffic_class: string;
  clicks: number;
  impressions: number;
  total_count: number;
}

export interface ValueReviewQuery {
  band?: string | null;
  source?: ValueSource | null;
  search?: string | null;
  sort?: "clicks" | "impressions" | "score" | "keyword";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface SiteGeoArea {
  id: string;
  site_id: string;
  label: string;
  area_kind: string;
  /** Words a human typed. Kept for names the gazetteer does not have. */
  match_tokens: string[];
  /**
   * Gazetteer places this area covers (`seo.geo_place.id`). Preferred over
   * `match_tokens`: a place carries its own aliases, its state qualifier and
   * its ambiguity rule, so "columbus" stops meaning four different cities.
   */
  place_ids: string[];
  geo_band: string;
  notes: string | null;
}

export interface ValueRule {
  id: string;
  name: string;
  description: string | null;
  pattern: string | null;
  match_kind: string | null;
  match_facet: string | null;
  match_facet_value: string | null;
  target_class: string | null;
  value_multiplier: number | null;
  site_id: string | null;
  notes: string | null;
}

export interface TopicNode {
  id: string;
  name: string;
  slug: string;
  node_type: string;
  parent_id: string | null;
  description: string | null;
}

export interface SiteTopicValue {
  id: string;
  site_id: string;
  topic_id: string;
  weight: number | null;
  lead_quality: string | null;
  service_match: string | null;
  notes: string | null;
}

/** Root node_type vocabulary (D32): offering roots count as acquisition;
 *  the rest are tracked value never sold as acquisition growth. */
export const OFFERING_ROOT_TYPES = [
  "service",
  "product",
  "problem",
  "audience",
  "brand",
] as const;
export const NON_OFFERING_ROOT_TYPES = [
  "authority",
  "existing_customer",
  "recruiting",
  "reputation",
  "partner",
] as const;

// ── Vocabulary governance ───────────────────────────────────────────────────

export type VocabKind = "value_band" | "geo_band";

/**
 * One row of a vocabulary being edited. `value` is the IDENTITY — it is what
 * seo.site_keyword_value.value_tier and seo.site_geo_area.geo_band store — and
 * is fixed once created. `label` is free text; renaming it re-labels every
 * keyword instantly, which is the point of owning your own vocabulary.
 */
export interface VocabularyDraftRow {
  value: string;
  label: string;
  description: string | null;
  sort: number;
  config: Record<string, unknown>;
}

/** What a PROPOSED band set does to this site's real keywords (server-banded). */
export interface BandPreviewRow {
  value_band: string;
  keywords: number;
  clicks: number;
  impressions: number;
  moved_in: number;
  moved_out: number;
}

/** One entry of a platform-governed vocabulary (platform.categories). */
export interface RegistryEntry {
  parent_id: string | null;
  parent_slug: string;
  parent_label: string | null;
  parent_description: string | null;
  value_id: string;
  value_slug: string;
  /** The bare value the classifier writes ('consumer'), not the namespaced slug. */
  value_key: string;
  value_label: string;
  value_description: string | null;
  value_config: Record<string, unknown>;
  /** True when seo.keyword's CHECK constraint actually accepts this value. */
  enforced: boolean;
  sort_order: number;
}

export interface FacetUsageRow {
  facet: string;
  value_key: string;
  keywords: number;
}

export type RegistryDimension = "seo_facet" | "seo_value_band" | "seo_geo_band";

// ── Industry starter packs (D36) ────────────────────────────────────────────

/**
 * A pack is the meaning layer a brand-new site in one industry adopts on day
 * one: suggested topic worth, qualifier/value rules, and the site's band
 * vocabularies. Packs are TEMPLATE ROWS, never code — adoption is a
 * copy-insert into the site-scoped tables, and everything it writes is a
 * starting position the business then edits or overrides.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */
export interface StarterPackSummary {
  id: string;
  slug: string;
  name: string;
  industry: string;
  summary: string | null;
  description: string | null;
  /** draft · proposed · ratified · retired — only ratified packs are canonical. */
  status: string;
  geo_model: string;
  guidelines: string | null;
  source_notes: string | null;
  source_corpus: Array<Record<string, unknown>>;
  ratified_at: string | null;
  ratification_notes: string | null;
  topic_count: number;
  rule_count: number;
  value_band_count: number;
  geo_band_count: number;
  geo_area_count: number;
}

export interface StarterPackTopicItem {
  item_id: string;
  topic_id: string;
  name: string;
  slug: string;
  node_type: string;
  parent_id: string | null;
  description: string | null;
  weight: number | null;
  lead_quality: string | null;
  service_match: string | null;
  notes: string | null;
  sort: number;
}

export interface StarterPackBandItem {
  item_id: string;
  value: string;
  label: string;
  description: string | null;
  config: Record<string, unknown>;
  notes: string | null;
  sort: number;
}

export interface StarterPackGeoAreaItem {
  item_id: string;
  label: string;
  area_kind: string | null;
  match_tokens: string[];
  geo_band: string;
  notes: string | null;
  sort: number;
}

export interface StarterPackRuleItem {
  rule_id: string;
  name: string;
  description: string | null;
  pattern: string | null;
  match_kind: string | null;
  match_facet: string | null;
  match_facet_value: string | null;
  target_class: string | null;
  value_multiplier: number | null;
  notes: string | null;
}

export interface StarterPackDetail {
  pack: StarterPackSummary;
  topics: StarterPackTopicItem[];
  value_bands: StarterPackBandItem[];
  geo_bands: StarterPackBandItem[];
  geo_areas: StarterPackGeoAreaItem[];
  rules: StarterPackRuleItem[];
}

/** What a pack part is called on the wire — the adopt RPC's `p_include`. */
export type StarterPackPart =
  | "topics"
  | "value_bands"
  | "geo_bands"
  | "geo_areas"
  | "rules";

/** Counts of rows actually written. Adoption is additive and idempotent: a
 *  second adopt writes nothing new, and never overwrites a site's own ruling. */
export interface StarterPackAdoptResult {
  pack: string;
  site_id: string;
  topics: number;
  value_bands: number;
  geo_bands: number;
  geo_areas: number;
  rules: number;
  guidelines_seeded: boolean;
  /** Areas this site already had, still empty, that this adoption filled in. */
  geo_areas_filled: number;
  /** Areas on this site that STILL have no place names — they match nothing. */
  geo_areas_pending: number;
}
