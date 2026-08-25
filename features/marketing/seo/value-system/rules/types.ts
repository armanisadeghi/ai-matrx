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
  /** Matched keywords with no topic worth: they receive the stamp, their band does not move. */
  stamped_only_keywords: number;
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
  /** C10 — business locations this area serves (`web.business_location.id`). */
  locationIds: string[];
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
  /**
   * KI-044 — NULL when the pass ran. `autonomy_off` / `autonomy_review_required`
   * when the autonomy ladder said it may not write, so a strip never reports
   * "nothing left to read" over a step that was simply not allowed to run.
   */
  skipped: string | null;
  /** The mode that decided it, for the sentence a person reads. */
  autonomy_mode: string | null;
}

export interface GeoAreaFormState {
  label: string;
  areaKind: string;
  /** Comma / newline separated while typing; split on save and on preview. */
  tokensText: string;
  /** Places picked from the gazetteer, kept whole so the chips can render. */
  places: GeoPlace[];
  /** C10 — business locations bound to this area. Ids: the picker reads rows. */
  locationIds: string[];
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

// ── Combinations (C7) ───────────────────────────────────────────────────────

/** What a combination does when every value in its set is stamped at once. */
export type ComboEffect = "add" | "scale" | "never";

export interface ValueComboFormState {
  /** 2–4 dimension VALUE ids (`platform.categories.id`), all-of. */
  valueIds: string[];
  effect: ComboEffect;
  /** Text so the field can be empty while typing; `never` ignores it. */
  amount: string;
  label: string;
  notes: string;
  enabled: boolean;
}

/** How many values a combination may hold — the DB CHECK says the same. */
export const COMBO_MIN_VALUES = 2;
export const COMBO_MAX_VALUES = 4;

// ── Does this area actually change a score? (2026-08-24) ────────────────────

/**
 * `seo.gsc_geo_area_health` — one row per live service area.
 *
 * `state` is the honest answer, not a percentage:
 *   empty        — nothing inside it: no picked place, no typed word.
 *   disconnected — full of places and carrying NO matchers, so it changes no
 *                  score at all. This is the C2 regression state, and the worst
 *                  one to be in because every other screen shows it as finished.
 *   no_hits      — wired correctly; no keyword has matched it yet.
 *   live         — matching keywords and counting in their value.
 */
export type GeoAreaState = "empty" | "disconnected" | "no_hits" | "live";

export interface GeoAreaHealthRow {
  area_id: string;
  label: string;
  geo_band: string;
  places: number;
  tokens: number;
  value_id: string | null;
  matchers: number;
  stamps: number;
  state: GeoAreaState;
}

// ── Does this RULE actually change a score? (2026-08-24) ────────────────────

/**
 * `seo.gsc_value_rule_health` — one row per live value rule.
 *
 * The rules half of the geo silence. A rule is complete on this screen the
 * moment its words and its multiplier are typed, and until 2026-08-24 that was
 * ALL it was: the resolver reads stamps, and authoring a rule minted no value,
 * no matcher and no worth. The trigger mints them now, so `disconnected` should
 * be unreachable — which is exactly why it is still read and still shown.
 *
 *   empty        — nothing mintable on the row at all.
 *   unresolved   — it scores a dimension value that does not exist.
 *   shadowed     — another live rule already scores that value; the incumbent
 *                  wins and this one is inert, for an honest reason.
 *   disconnected — complete and minting nothing. The regression class.
 *   held         — the rule's CLASS half is waiting on auto_apply, deliberately
 *                  not live. Decided on the class matcher alone, so a rule that
 *                  is both a class and a value rule still reports it.
 *   no_hits      — wired correctly; no keyword has matched it yet.
 *   live         — matching keywords and counting in their value.
 */
export type ValueRuleState =
  | "empty"
  | "unresolved"
  | "shadowed"
  | "disconnected"
  | "held"
  | "no_hits"
  | "live";

export interface ValueRuleHealthRow {
  rule_id: string;
  name: string;
  is_class: boolean;
  is_qualifier: boolean;
  is_facet: boolean;
  target_class: string | null;
  pattern: string | null;
  value_multiplier: number | null;
  auto_apply: boolean;
  value_id: string | null;
  matchers: number;
  enabled_matchers: number;
  worth: number;
  stamps: number;
  /** Name of the live rule already scoring this value, when `shadowed`. */
  conflict_rule: string | null;
  state: ValueRuleState;
}

/** What `seo.gsc_value_rule_reconnect` reports back after re-minting + stamping. */
export interface ValueRuleReconnectResult {
  rules_synced: number;
  conflicts: number;
  scope_keywords: number;
  matchers: number;
  stamped: number;
  removed: number;
  single_cardinality_conflicts: number;
  evaluated_at: string;
}

/** What `seo.gsc_geo_area_reconnect` reports back after re-minting + stamping. */
export interface GeoAreaReconnectResult {
  areas_synced: number;
  scope_keywords: number;
  matchers: number;
  stamped: number;
  removed: number;
  single_cardinality_conflicts: number;
  evaluated_at: string;
}
