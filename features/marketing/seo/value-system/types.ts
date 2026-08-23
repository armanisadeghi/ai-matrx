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
  | { kind: "override"; level?: string | null }
  /** C2: the leading summary row — Σ adds → × factor (capped) → never. */
  | { kind: "summary"; adds: number; factor: number; n_factors: number; never: boolean; score: number | null }
  | { kind: "topic"; topic: string; weight: number; root: string | null; negative_guard: boolean; effect?: "add"; amount?: number }
  | { kind: "no_base"; pending_base: true }
  /** C2: a stamped value that carries worth for this site. */
  | {
      kind: "stamp";
      dimension: string;
      dimension_label: string;
      value: string;
      value_label: string;
      value_id: string;
      effect: "add" | "scale" | "never";
      amount: number | null;
      source: string;
      matcher_id: string | null;
      notes: string | null;
      /**
       * C5 (P20) — `situational` stamps describe what is happening to this
       * keyword on this site RIGHT NOW and always arrive with `as_of`. An
       * `intrinsic` stamp describes the words and carries no time.
       */
      nature?: "intrinsic" | "situational";
      as_of?: string | null;
    }
  /** Pre-C2 shapes, tolerated until every cached receipt is recomputed. */
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

/**
 * Where a site-plane row came from. Every row `adopt_starter_pack` writes
 * carries `adopted_from_pack` (the pack slug) plus the template identity —
 * `template_rule_id` for rules, `pack_item_id` for everything else. A row the
 * site authored itself carries neither. This is what the Rulebook's source
 * chip reads; nothing else is a source of provenance.
 */
export interface PackProvenance {
  adopted_from_pack?: string;
  template_rule_id?: string;
  pack_item_id?: string;
  reset_to_pack_at?: string;
  places_pending?: boolean;
}

export interface SiteGeoArea {
  id: string;
  site_id: string;
  label: string;
  area_kind: string;
  metadata: PackProvenance;
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
  metadata: PackProvenance;
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
  /** `iam.industries` this pack is FOR — null until the admin side links it. */
  industry_id: string | null;
  industry_name: string | null;
  /** True when the caller's org has opted into this pack's industry
   *  (`iam.org_industries`) — those packs list first. */
  org_match: boolean;
  industry_slug: string | null;
  /** Bumps on every content edit (D4) — the join key for "changed since you adopted". */
  pack_version: number;
  /** How the caller reaches this pack: admin · curator · organization (subscribed/pilot) · industry · global. */
  entitled_via: "admin" | "curator" | "organization" | "industry" | "global" | null;
  /** The evaluated org holds an organization-audience grant (its subscription / pilot). */
  subscribed: boolean;
  subscriber_count: number;
  supersedes_pack_id: string | null;
  proposed_at: string | null;
  updated_at: string;
  /** The caller may edit this pack (admin, or its industry's curator while draft/proposed). */
  can_author: boolean;
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
  /** Rows put back to the pack's values by a `reset` call (0 otherwise). */
  reset_rules: number;
  reset_topics: number;
  reset_value_bands: number;
  reset_geo_bands: number;
  reset_geo_areas: number;
}

// ── Provenance: what a pack did to THIS site, item by item ──────────────────

/**
 * `missing`    — the pack proposes it and the site has no row (never adopted,
 *                or the item was unticked at adoption).
 * `as_adopted` — the site row still says what the pack says.
 * `changed`    — the site edited it after adoption ("Changed from pack").
 * `archived`   — the site archived its copy; that is a ruling, "fill" never
 *                revives it, only "reset to pack" does.
 * `yours`      — (topic worth only) the site set this topic's worth itself,
 *                before or instead of the pack.
 */
export type PackItemState = "missing" | "as_adopted" | "changed" | "archived" | "yours";

export type PackItemKind = "rule" | "value_band" | "geo_band" | "geo_area" | "topic";

export interface StarterPackStatusItem {
  kind: PackItemKind;
  /** The template identity: the template rule id, or the starter_pack_item id. */
  ref: string;
  topic_id?: string;
  label: string;
  site_row_id: string | null;
  /** The pack's values for this item (shape depends on `kind`). */
  pack: Record<string, unknown>;
  /** The site's values, or null when `missing`. */
  site: Record<string, unknown> | null;
  state: PackItemState;
  sort: number;
}

/**
 * What an EDITOR shows about the row it is editing when that row came from a
 * pack: the pack's own values beside the site's, and the one-click revert.
 * Built by the Rulebook from `starter_pack_site_status`; the editor renders
 * it and calls `onRevert` — it never re-derives provenance itself.
 */
export interface EditorProvenance {
  packId: string;
  packName: string;
  packSlug: string;
  state: PackItemState;
  /** One line: what the pack proposes for this row ("×0.1 · the word “crt”"). */
  packSummary: string;
  /** One line: what the site has now. */
  siteSummary: string;
  /** Puts the row back to the pack's values through the ONE adoption write. */
  onRevert: () => Promise<void>;
}

export interface StarterPackStatusCounts {
  total: number;
  missing: number;
  as_adopted: number;
  changed: number;
  archived: number;
  yours: number;
  places_pending: number;
}

export interface StarterPackSiteStatus {
  pack_id: string;
  slug: string;
  adopted: boolean;
  adopted_at: string | null;
  adopted_by: string | null;
  adopted_by_label: string | null;
  counts: StarterPackStatusCounts;
  items: StarterPackStatusItem[];
}

/** One receipt row per pack this site has adopted anything from. */
export interface StarterPackAdoption {
  pack_id: string;
  slug: string;
  name: string;
  status: string;
  adopted_at: string | null;
  adopted_by: string | null;
  adopted_by_label: string | null;
  total: number;
  as_adopted: number;
  changed: number;
  archived: number;
  missing: number;
  places_pending: number;
}

// ── Preview: what adopting would do to THIS site's keywords ─────────────────

export interface PreviewSampleKeyword {
  keyword_id: string;
  keyword: string;
  clicks: number;
  impressions: number;
  from_band: string;
  to_band: string;
}

export interface PreviewMovement {
  from_band: string;
  to_band: string;
  keywords: number;
  clicks: number;
  impressions: number;
}

export interface StarterPackPreviewRule {
  rule_id: string;
  already_adopted: boolean;
  keywords: number;
  clicks: number;
  impressions: number;
  moved: number;
  samples: PreviewSampleKeyword[];
}

export interface StarterPackPreviewTopic {
  item_id: string;
  topic_id: string;
  already_valued: boolean;
  /** Keywords in the window sitting under this topic today. */
  keywords: number;
  clicks: number;
  impressions: number;
  /** Keywords whose BASE would come from this pack topic after adoption. */
  would_base: number;
  samples: PreviewSampleKeyword[];
}

export interface StarterPackPreview {
  window_keywords: number;
  summary: {
    window_keywords: number;
    matched_keywords: number;
    matched_clicks: number;
    matched_impressions: number;
    moved_keywords: number;
    /** Touched by a rule but with no topic base — stamped, not valued (yet). */
    stamped_only_keywords: number;
    protected_keywords: number;
    movements: PreviewMovement[];
    samples: Array<PreviewSampleKeyword & { source: string; stamped_only: boolean }>;
  };
  unvalued_before: number;
  unvalued_after: number;
  band_counts_before: Record<string, number>;
  band_counts_after: Record<string, number>;
  rules: StarterPackPreviewRule[];
  topics: StarterPackPreviewTopic[];
}
