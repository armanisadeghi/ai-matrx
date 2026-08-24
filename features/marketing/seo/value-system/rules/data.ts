/**
 * VALUE RULE + GEO AREA AUTHORING — data layer.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 *
 * WRITE PATHS (one per table, deliberately):
 *   seo.keyword_class_rule → `features/marketing/search-console/data-class-rules.ts`
 *     (`createValueRule` / `updateValueRule` / `archiveRule`). That module already
 *     owned every insert into this table for CLASS rules; D34 says class and value
 *     are ONE rules engine, so the value editor extends it rather than teaching a
 *     second module to write the same rows.
 *   seo.site_geo_area → HERE. Nothing wrote this table before; this module is its
 *     only writer.
 *
 * PREVIEWS ARE SERVER-SIDE, ALWAYS. `previewValueRule` / `previewGeoArea` call
 * SECURITY DEFINER RPCs guarded by `seo.gsc_assert_site_access`; a band is never
 * re-derived on the client (value-system.md, law 3). The RPCs do arithmetic over
 * the resolver's own `reasons` chain — there is still exactly ONE resolver.
 *
 * THE FACET PICKER IS REGISTRY-DRIVEN. `listFacetDimensions` reads
 * `seo.facet_dimension_catalog(site)`, never a hardcoded list — a dimension a
 * site invented this afternoon has to be pickable the same afternoon, and the
 * `keyword_class_rule_assert_facet` trigger validates against that same registry.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage, makeAssertData } from "@/utils/errors";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Json } from "@/types/database.types";
import type {
  FacetDimension,
  GeoAreaDraft,
  GeoPlace,
  MeaningUsageRow,
  PlaceDetectionPass,
  PlaceDetectionStatus,
  RuleImpact,
  ComboEffect,
  GeoAreaHealthRow,
  GeoAreaReconnectResult,
  ValueRuleHealthRow,
  ValueRuleReconnectResult,
} from "./types";
import type { SiteGeoArea, ValueCombo } from "../types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your value rules");

/**
 * Governance raises speak for themselves.
 *
 * The DB writes these sentences FOR the person reading them — "“newark (nj)”
 * contains a character this place name cannot use", "a multiplier must be
 * greater than 0…", "“x” is not a value of “audience_type”. Allowed: …".
 * Replacing them with a generic apology turns a rule the user can fix into a
 * mystery, which is the exact failure this whole feature exists to prevent.
 * A raise carrying one of OUR codes reaches the reader verbatim; anything else
 * still gets the calm generic sentence.
 */
const GOVERNANCE_CODE =
  /^(seo_rule_[a-z_]+|seo_geo_[a-z_]+|seo_combo_[a-z_]+|gsc_site_[a-z_]+|seo_registry_[a-z_]+):\s*/;

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

// ── Query keys ──────────────────────────────────────────────────────────────

export const facetDimensionsQueryKey = (siteId: string) =>
  ["seo", "value-rules", "facet-dimensions", siteId] as const;
export const valueRulesQueryKey = (siteId: string) =>
  ["seo", "value-rules", "rules", siteId] as const;
export const geoAreasQueryKey = (siteId: string) =>
  ["seo", "value-rules", "geo-areas", siteId] as const;
export const meaningUsageQueryKey = (siteId: string, start: string, end: string) =>
  ["seo", "value-rules", "usage", siteId, start, end] as const;
export const placeDetectionQueryKey = (siteId: string) =>
  ["seo", "value-rules", "place-detection", siteId] as const;
export const valueCombosQueryKey = (siteId: string) =>
  ["seo", "value-rules", "combos", siteId] as const;
export const geoPlaceSearchQueryKey = (query: string, kinds: string[]) =>
  ["seo", "value-rules", "geo-places", query, kinds.join("|")] as const;
export const geoAreaHealthQueryKey = (siteId: string) =>
  ["seo", "value-rules", "geo-area-health", siteId] as const;
export const valueRuleHealthQueryKey = (siteId: string) =>
  ["seo", "value-rules", "rule-health", siteId] as const;

/** Every query key the value workbench keeps in cache for this site. Saving a
 *  rule or an area changes what EVERY one of them says, so they invalidate
 *  together — a stale band beside a fresh rule is a lie. */
export function valueSurfaceQueryKeys(siteId: string) {
  return [
    facetDimensionsQueryKey(siteId),
    valueRulesQueryKey(siteId),
    geoAreasQueryKey(siteId),
    geoAreaHealthQueryKey(siteId),
    valueRuleHealthQueryKey(siteId),
    valueCombosQueryKey(siteId),
    // The LIVE workbench ("marketing/value/...") — its review table, summary,
    // band vocabulary and meaning health all hang off this one prefix. It was
    // missing here, so saving a rule refreshed the meaning panel and left the
    // keyword table showing the arithmetic from before the save.
    ["marketing", "value"],
    ["marketing", "value-c", "rules", siteId],
    ["marketing", "value-c", "geo-areas", siteId],
    ["marketing", "value-c", "summary", siteId],
    ["marketing", "value-c", "review", siteId],
    ["seo", "value-rules", "usage", siteId],
    placeDetectionQueryKey(siteId),
    ["marketing", "value-b"],
    ["marketing", "value-d"],
  ];
}

// ── The live dimension registry (never a hardcoded list of 13) ──────────────

export async function listFacetDimensions(
  siteId: string,
  signal?: AbortSignal,
): Promise<FacetDimension[]> {
  const response = await (await seoDb())
    .rpc("facet_dimension_catalog", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(
    response.data,
    response.error,
    "list your keyword dimensions",
  ) as unknown as FacetDimension[];
}

/**
 * What every rule and area is CURRENTLY doing — read back out of the
 * resolver's own reason chain in ONE call, never by re-matching per row. A
 * rule that fires on nothing must be visibly different from a rule that
 * carries the business.
 */
export async function getMeaningUsage(
  siteId: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<MeaningUsageRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_value_meaning_usage", {
      p_site_id: siteId,
      p_start: start,
      p_end: end,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(
    response.data,
    response.error,
    "measure what your rules are doing",
  ) as unknown as MeaningUsageRow[];
}

// ── Live match preview — SERVER-side banding, always ────────────────────────

export interface ValueRulePreviewInput {
  siteId: string;
  start: string;
  end: string;
  multiplier: number;
  pattern?: string | null;
  matchKind?: string | null;
  matchFacet?: string | null;
  matchFacetValue?: string | null;
  /** Set when EDITING: the rule's own current effect is swapped out first. */
  ruleId?: string | null;
  sample?: number;
}

export async function previewValueRule(
  input: ValueRulePreviewInput,
  signal?: AbortSignal,
): Promise<RuleImpact> {
  const response = await (await seoDb())
    .rpc("gsc_value_rule_preview", {
      p_site_id: input.siteId,
      p_start: input.start,
      p_end: input.end,
      p_multiplier: input.multiplier,
      p_pattern: input.pattern ?? undefined,
      p_match_kind: input.matchKind ?? undefined,
      p_match_facet: input.matchFacet ?? undefined,
      p_match_facet_value: input.matchFacetValue ?? undefined,
      p_rule_id: input.ruleId ?? undefined,
      p_sample: input.sample ?? 10,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(
    response.data,
    response.error,
    "work out what that rule does",
  ) as unknown as RuleImpact;
}

export interface GeoAreaPreviewInput {
  siteId: string;
  start: string;
  end: string;
  tokens: string[];
  /** Gazetteer places the proposed area covers — matched through detections. */
  placeIds: string[];
  geoBand: string;
  /** Set when EDITING: the area's own current effect is swapped out first. */
  areaId?: string | null;
  sample?: number;
}

export async function previewGeoArea(
  input: GeoAreaPreviewInput,
  signal?: AbortSignal,
): Promise<RuleImpact> {
  const response = await (await seoDb())
    .rpc("gsc_geo_area_preview", {
      p_site_id: input.siteId,
      p_start: input.start,
      p_end: input.end,
      p_tokens: input.tokens as unknown as Json,
      p_place_ids: input.placeIds,
      p_geo_band: input.geoBand,
      p_area_id: input.areaId ?? undefined,
      p_sample: input.sample ?? 10,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(
    response.data,
    response.error,
    "work out what that area does",
  ) as unknown as RuleImpact;
}

// ── seo.site_geo_area — THE write path (this module is its only writer) ─────

const GEO_AREA_COLUMNS =
  "id, site_id, label, area_kind, match_tokens, place_ids, location_ids, geo_band, notes";

function geoAreaWriteColumns(draft: GeoAreaDraft, siteId: string) {
  return {
    site_id: siteId,
    label: draft.label.trim(),
    area_kind: draft.areaKind,
    match_tokens: draft.tokens as unknown as Json,
    place_ids: draft.placeIds,
    // C10 — the binding a human made. Written as an empty array rather than
    // NULL so "unbound" is a state the row states, not one it omits.
    location_ids: draft.locationIds,
    geo_band: draft.geoBand,
    notes: draft.notes.trim() || null,
  };
}

export async function createGeoArea(
  draft: GeoAreaDraft,
  siteId: string,
  organizationId: string | null,
): Promise<SiteGeoArea> {
  const resolvedOrganizationId = await ensureOrgId(organizationId);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const response = await (await seoDb())
    .from("site_geo_area")
    .insert({
      ...geoAreaWriteColumns(draft, siteId),
      organization_id: resolvedOrganizationId,
      created_by: user.id,
      updated_by: user.id,
    })
    .select(GEO_AREA_COLUMNS)
    .single();
  return assertGoverned(
    response.data,
    response.error,
    "save that area",
  ) as unknown as SiteGeoArea;
}

export async function updateGeoArea(
  areaId: string,
  draft: GeoAreaDraft,
  siteId: string,
): Promise<SiteGeoArea> {
  const response = await (await seoDb())
    .from("site_geo_area")
    .update(geoAreaWriteColumns(draft, siteId))
    .eq("id", areaId)
    .select(GEO_AREA_COLUMNS)
    .single();
  return assertGoverned(
    response.data,
    response.error,
    "update that area",
  ) as unknown as SiteGeoArea;
}

/**
 * IS THIS AREA ACTUALLY CHANGING A SCORE?
 *
 * 🚨 2026-08-24 — the regression this exists to make impossible. C1 moved every
 * geo contribution onto stamps and C2 stopped the resolver reading
 * `seo.site_geo_area` at all, but the authoring path above kept writing plain
 * rows. For months every service area on every site was FULL of places and
 * matched nothing: the screen said "11 places from the gazetteer", the Geo
 * dimension said "0 keywords sorted", and geography changed no score anywhere.
 *
 * The trigger on the table now mints the meaning, so `disconnected` should never
 * be reachable again — which is exactly why it is still read and still shown.
 * A state that can no longer happen and is no longer watched for is how the
 * same silence comes back.
 */
export async function listGeoAreaHealth(siteId: string): Promise<GeoAreaHealthRow[]> {
  const response = await (await seoDb()).rpc("gsc_geo_area_health", {
    p_site_id: siteId,
  });
  return assertGoverned(
    response.data,
    response.error,
    "check whether your service areas are changing any scores",
  ) as unknown as GeoAreaHealthRow[];
}

/** The one-click fix behind that alarm: re-mint every area's meaning, then run
 *  the matcher engine so the stamps land immediately. Nothing typed is lost. */
export async function reconnectGeoAreas(siteId: string): Promise<GeoAreaReconnectResult> {
  const response = await (await seoDb()).rpc("gsc_geo_area_reconnect", {
    p_site_id: siteId,
  });
  return assertGoverned(
    response.data,
    response.error,
    "reconnect your service areas",
  ) as unknown as GeoAreaReconnectResult;
}

/**
 * IS THIS RULE ACTUALLY CHANGING A SCORE?
 *
 * 🚨 2026-08-24 — the rules half of the geo regression. `seo.keyword_class_rule`
 * had no meaning-minting trigger, and the write path in
 * `features/marketing/search-console/data-class-rules.ts` saved the row and
 * nothing else, so a rule authored in this UI produced no dimension value, no
 * matcher and no worth. The C2 resolver reads STAMPS only, so it never saw the
 * rule at all: the screen said "certified × 2.5" and the score did not move.
 * The rules that worked did so only because C1's one-off migration minted them
 * by hand.
 *
 * A trigger mints the meaning now, so `disconnected` should be unreachable —
 * which is precisely why this read stays and the alarm stays on the page. A
 * state that can no longer happen and is no longer watched for is how the same
 * silence comes back.
 */
export async function listValueRuleHealth(siteId: string): Promise<ValueRuleHealthRow[]> {
  const response = await (await seoDb()).rpc("gsc_value_rule_health", {
    p_site_id: siteId,
  });
  return assertGoverned(
    response.data,
    response.error,
    "check whether your value rules are changing any scores",
  ) as unknown as ValueRuleHealthRow[];
}

/** The one-click fix behind that alarm: re-mint every rule's meaning, then run
 *  the matcher engine over exactly the keywords those rules can reach, so the
 *  stamps land before the page refetches. Nothing typed is lost. */
export async function reconnectValueRules(siteId: string): Promise<ValueRuleReconnectResult> {
  const response = await (await seoDb()).rpc("gsc_value_rule_reconnect", {
    p_site_id: siteId,
  });
  return assertGoverned(
    response.data,
    response.error,
    "reconnect your value rules",
  ) as unknown as ValueRuleReconnectResult;
}

/** Archive = soft delete. The resolver stops seeing it the moment it lands. */
export async function archiveGeoArea(areaId: string): Promise<void> {
  const response = await (await seoDb())
    .from("site_geo_area")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", areaId);
  if (response.error) throw new Error(response.error.message);
}

// ── The gazetteer (I3) — places instead of typed words ──────────────────────

/**
 * Type-ahead over `seo.geo_place`: the 50 states + DC, the top 1,000 US cities
 * by population, and the local-grammar phrases ("near me", "in my area").
 *
 * WHY A PLACE BEATS A WORD, said once here because the editor says it to the
 * user: a picked place carries its aliases, the state that disambiguates it,
 * and its ambiguity rule. Typing "columbus" means four cities; picking
 * Columbus, OH means one. Typed tokens are still supported and still right for
 * a neighbourhood or a nickname the gazetteer has never heard of.
 */
export async function searchGeoPlaces(
  query: string,
  kinds: string[],
  limit: number,
  signal?: AbortSignal,
): Promise<GeoPlace[]> {
  const response = await (await seoDb())
    .rpc("geo_place_search", {
      p_query: query,
      // The RPC's p_kinds has no default: an empty list means "no filter",
      // and the whole gazetteer is the honest answer to that.
      p_kinds: kinds,
      p_limit: limit,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(
    response.data,
    response.error,
    "search places",
  ) as unknown as GeoPlace[];
}

/** The exact places an area already holds, so editing one shows its chips. */
export async function getGeoPlacesByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<GeoPlace[]> {
  if (ids.length === 0) return [];
  const response = await (await seoDb())
    .from("geo_place")
    .select("id, place_kind, name, state_code, population, ambiguity, ambiguity_reason")
    .in("id", ids)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "read those places") as unknown as Array<
    Omit<GeoPlace, "label" | "keyword_count">
  >;
  return rows.map((row) => ({
    ...row,
    label: row.place_kind === "city" && row.state_code ? `${row.name}, ${row.state_code}` : row.name,
    keyword_count: 0,
  }));
}

/**
 * The place-detection scoreboard (`seo.keyword_place_status`). Server state, so
 * it survives the tab — the same reason the facet backfill strip reads a ledger
 * rather than counting in the browser.
 */
export async function getPlaceDetectionStatus(
  siteId: string,
  minImpressions: number,
  signal?: AbortSignal,
): Promise<PlaceDetectionStatus> {
  const response = await (await seoDb())
    .rpc("keyword_place_status", {
      p_site_id: siteId,
      p_min_impressions: minImpressions,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(
    response.data,
    response.error,
    "read place-detection progress",
  ) as unknown as PlaceDetectionStatus[];
  const row = Array.isArray(rows) ? rows[0] : (rows as unknown as PlaceDetectionStatus);
  if (!row) throw new Error("Place detection reported no status at all.");
  return row;
}

/**
 * One bounded, demand-ordered detection pass. Both ceilings are feature knobs
 * read by the caller — this module never invents a number, because a knob with
 * a code fallback is not a knob.
 */
export async function runPlaceDetectionPass(
  batchKeywords: number,
  minImpressions: number,
): Promise<PlaceDetectionPass> {
  const response = await (await seoDb()).rpc("fn_backfill_keyword_places", {
    p_limit: batchKeywords,
    p_min_impressions: minImpressions,
  });
  const rows = assertGoverned(
    response.data,
    response.error,
    "run a place-detection pass",
  ) as unknown as PlaceDetectionPass[];
  const row = Array.isArray(rows) ? rows[0] : (rows as unknown as PlaceDetectionPass);
  if (!row) throw new Error("The pass reported nothing at all.");
  return row;
}

// ── seo.site_value_combo (C7) — ONE write RPC, one list read ────────────────

/**
 * COMBINATIONS. Worth hung on a SET of values instead of one, because two
 * mediocre signals together are not the sum of two mediocre signals. Arman:
 * "if a keyword is not an enterprise keyword, and it also happens to then
 * carry, let's say, New York with it, well, then that's dead in the water
 * because it's two strikes against you … it's not a point system."
 *
 * The DB owns everything: `seo.gsc_value_combo_set` is the ONE write path
 * (site-editor guarded, insert + update + archive), `gsc_value_combo_list` the
 * one read, and `gsc_value_combo_preview` the what-if — the same server-side
 * banding every other preview uses, over the same effective stamps the
 * resolver reads (`seo.fn_effective_stamps`). Nothing is re-derived here.
 */
export async function listValueCombos(
  siteId: string,
  signal?: AbortSignal,
): Promise<ValueCombo[]> {
  const response = await (await seoDb())
    .rpc("gsc_value_combo_list", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(
    response.data,
    response.error,
    "list your combinations",
  ) as unknown as ValueCombo[];
}

export interface ValueComboDraft {
  /** 2–4 dimension VALUE ids, all-of. Order is irrelevant — the DB canonicalises. */
  valueIds: string[];
  effect: ComboEffect;
  /** null for `never` — never is a flag, not a number. */
  amount: number | null;
  label: string;
  notes: string;
  enabled: boolean;
}

export async function saveValueCombo(
  siteId: string,
  draft: ValueComboDraft,
  comboId: string | null,
): Promise<{ id: string; label: string | null }> {
  const response = await (await seoDb()).rpc("gsc_value_combo_set", {
    p_site_id: siteId,
    p_value_ids: draft.valueIds,
    p_effect: draft.effect,
    p_amount: draft.amount ?? undefined,
    p_label: draft.label.trim() || undefined,
    p_notes: draft.notes.trim() || undefined,
    p_enabled: draft.enabled,
    p_combo_id: comboId ?? undefined,
  });
  return assertGoverned(
    response.data,
    response.error,
    "save that combination",
  ) as unknown as { id: string; label: string | null };
}

/** Archive = soft delete. Every keyword it was scoring re-resolves without it. */
export async function archiveValueCombo(siteId: string, comboId: string): Promise<void> {
  const response = await (await seoDb()).rpc("gsc_value_combo_set", {
    p_site_id: siteId,
    p_combo_id: comboId,
    p_archive: true,
  });
  assertGoverned(response.data, response.error, "archive that combination");
}

export interface ValueComboPreviewInput {
  siteId: string;
  start: string;
  end: string;
  valueIds: string[];
  effect: ComboEffect;
  amount: number | null;
  /** Set when EDITING: the combination's own current effect is swapped out first. */
  comboId?: string | null;
  sample?: number;
}

export async function previewValueCombo(
  input: ValueComboPreviewInput,
  signal?: AbortSignal,
): Promise<RuleImpact> {
  const response = await (await seoDb())
    .rpc("gsc_value_combo_preview", {
      p_site_id: input.siteId,
      p_start: input.start,
      p_end: input.end,
      p_value_ids: input.valueIds,
      p_effect: input.effect,
      p_amount: input.amount ?? undefined,
      p_combo_id: input.comboId ?? undefined,
      p_sample: input.sample ?? 10,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(
    response.data,
    response.error,
    "work out what that combination does",
  ) as unknown as RuleImpact;
}
