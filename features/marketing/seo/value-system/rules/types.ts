/**
 * VALUE RULE + GEO AREA AUTHORING — client types.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 * Nothing here re-derives a band or a score; `RuleImpact` is the shape the
 * server hands back from `seo.gsc_value_rule_preview` /
 * `seo.gsc_geo_area_preview`, already banded.
 */

/** One dimension from the LIVE registry (`seo.facet_dimension_catalog`). */
export interface FacetDimensionValue {
  value_id: string;
  slug: string;
  /** The bare key a rule stores in `match_facet_value` ('consumer'). */
  key: string;
  label: string;
  description: string | null;
  keyword_count: number;
}

export interface FacetDimension {
  dimension_id: string;
  /** What a rule stores in `match_facet`. */
  slug: string;
  label: string;
  description: string | null;
  /** 'platform' = a universal fact · 'site' = this site invented it. */
  scope: string;
  cardinality: string;
  site_id: string | null;
  is_system: boolean;
  value_count: number;
  keyword_count: number;
  rule_count: number;
  facet_values: FacetDimensionValue[];
}

/** One keyword the proposal touches, with where it lands. */
export interface RuleImpactSample {
  keyword_id: string;
  keyword: string;
  clicks: number;
  impressions: number;
  from_band: string;
  to_band: string;
  from_score: number | null;
  to_score: number | null;
  source: string;
}

export interface RuleImpactMovement {
  from_band: string;
  to_band: string;
  keywords: number;
  clicks: number;
  impressions: number;
}

/**
 * What a PROPOSED rule or area does to this site's real keywords, measured
 * server-side before anything is saved. Arman's law — "logical things that are
 * wrong are the worst types of things" — is why nothing here is optional.
 */
export interface RuleImpact {
  /** Keywords in the measured GSC window (the denominator). */
  window_keywords: number;
  matched_keywords: number;
  matched_clicks: number;
  matched_impressions: number;
  /** Of the matched keywords, how many actually change band. */
  moved_keywords: number;
  /** Matched keywords an expert already ruled — arithmetic never moves them. */
  protected_keywords: number;
  movements: RuleImpactMovement[];
  samples: RuleImpactSample[];
}

/** One row of `seo.gsc_value_meaning_usage` — a rule or area's live effect. */
export interface MeaningUsageRow {
  kind: "rule" | "geo_area";
  /** rule id for a rule; the area's label for an area. */
  ref: string;
  band: string | null;
  keywords: number;
  clicks: number;
  impressions: number;
}

// ── Drafts ──────────────────────────────────────────────────────────────────

export type RuleMatchMode = "phrase" | "fact";

export interface ValueRuleFormState {
  name: string;
  description: string;
  mode: RuleMatchMode;
  pattern: string;
  matchKind: string;
  matchFacet: string;
  matchFacetValue: string;
  /** Kept as text so a half-typed "0." is not silently reinterpreted. */
  multiplier: string;
  notes: string;
}

export const AREA_KINDS = [
  { key: "city", label: "City" },
  { key: "county", label: "County" },
  { key: "region", label: "Region" },
  { key: "state", label: "State / province" },
  { key: "country", label: "Country" },
  { key: "radius", label: "Driving radius" },
  { key: "other", label: "Other" },
] as const;

export interface GeoAreaDraft {
  label: string;
  areaKind: string;
  /** Whole words matched against the keyword. Regex characters are refused. */
  tokens: string[];
  /** Gazetteer places (`seo.geo_place.id`) this area covers. */
  placeIds: string[];
  geoBand: string;
  notes: string;
}

/**
 * One row of the platform gazetteer (`seo.geo_place_search`). A picked place
 * beats a typed word because it carries what the word cannot: its aliases, the
 * state that disambiguates it, and whether its name is also an ordinary English
 * word ("Mobile", "Orange", "Normal") that only counts with a state beside it.
 */
export interface GeoPlace {
  id: string;
  place_kind: string;
  name: string;
  state_code: string | null;
  population: number | null;
  ambiguity: string;
  ambiguity_reason: string | null;
  /** "Irvine, CA" / "California" / "near me" — what the chip reads. */
  label: string;
  keyword_count: number;
}

/** What `seo.keyword_place_status` answers — the place-detection scoreboard. */
export interface PlaceDetectionStatus {
  queue_total: number;
  queue_scanned: number;
  queue_pending: number;
  queue_deferred: number;
  pending_clicks: number;
  pending_impressions: number;
  scanned_clicks: number;
  queue_clicks: number;
  keywords_with_places: number;
  keywords_explicit_local: number;
  next_phrase: string | null;
  last_scanned_at: string | null;
  site_keywords: number | null;
  site_keywords_scanned: number | null;
  site_keywords_local: number | null;
  site_clicks: number | null;
  site_local_clicks: number | null;
  areas_total: number;
  areas_with_places: number;
  areas_empty: number;
  demand_window_days: number;
}

export interface PlaceDetectionPass {
  claimed: number;
  keywords_with_places: number;
  places_written: number;
  local_intent_stamped: number;
  human_protected: number;
}

export interface GeoAreaFormState {
  label: string;
  areaKind: string;
  /** Comma / newline separated while typing; split on save and on preview. */
  tokensText: string;
  /** Places picked from the gazetteer, kept whole so the chips can render. */
  places: GeoPlace[];
  geoBand: string;
  notes: string;
}

/** Split the free-text token box the same way every time — one place. */
export function parseTokens(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const token = raw.trim().toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** The characters `seo.assert_safe_match_token` refuses, checked here too so
 *  the person sees it before a round trip. The DB stays the authority. */
const UNSAFE = /[^\p{L}\p{N}\s'\-./&_]/u;

export function unsafeTokens(tokens: string[]): string[] {
  return tokens.filter((token) => UNSAFE.test(token));
}

export function isUnsafePattern(pattern: string): boolean {
  return UNSAFE.test(pattern);
}

export const MATCH_KINDS = [
  { key: "word", label: "contains the whole word", hint: "“free” matches “free pickup”, not “freezer”." },
  { key: "contains", label: "contains anywhere", hint: "“crt” also matches “concrt” — usually you want whole word." },
  { key: "exact", label: "is exactly", hint: "The whole search is this phrase and nothing else." },
  { key: "starts_with", label: "starts with", hint: "" },
  { key: "ends_with", label: "ends with", hint: "" },
] as const;
