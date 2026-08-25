/**
 * Keyword DIMENSIONS — data layer for the dimension manager.
 *
 * WHY THIS FILE EXISTS. Until 2026-08-21 the keyword vocabulary was 13 hard
 * TEXT columns on seo.keyword, each fenced by a CHECK array. A business could
 * not add the one dimension its own economics depend on without an engineer
 * and a migration, and an agent that invented `certificate_seeking` in its head
 * on Tuesday used a different set on Wednesday — nondeterministic by
 * construction, and the user got no say. `migrations/seo_keyword_facet_dimensions.sql`
 * moved the vocabulary into platform.categories and gave sites the right to
 * author their own. This module is the client half of that contract.
 *
 * THE CONTRACT (all SECURITY DEFINER, all governance enforced in the DB):
 *  - seo.facet_dimension_catalog(p_site_id)  — every dimension this site sees.
 *  - seo.facet_dimension_upsert(...)         — p_site_id NULL = platform
 *                                              (super-admin); set = the site's own.
 *  - seo.facet_value_upsert(...)             — add / edit a value.
 *  - seo.facet_registry_usage()              — keywords carrying each value.
 *
 * NEVER re-implement a governance check here. The DB raises `seo_registry_*:`
 * with a sentence written for the reader; `assertGoverned` strips the code and
 * surfaces that sentence verbatim. A UI-only check is not a rule.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage, makeAssertData } from "@/utils/errors";
import type { Database, Json } from "@/types/database.types";
import type {
  MatcherKind,
  WorthEffect,
} from "@/features/marketing/seo/value-system/suggestions/proposal";
import type { RuleImpact } from "@/features/marketing/seo/value-system/rules/types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your keyword dimensions");

/**
 * Governance codes the dimension contract raises. Every one of these carries a
 * sentence AFTER the colon that was written for a non-technical reader — it is
 * shown as-is, never replaced with "something went wrong".
 */
const GOVERNANCE_CODE =
  /^(seo_registry_[a-z_]+|seo_rule_[a-z_]+|seo_matcher_[a-z_]+|seo_worth_[a-z_]+|seo_suggest_[a-z_]+|gsc_no_keywords|gsc_site_[a-z_]+):\s*/;

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

export type DimensionScope = "platform" | "site";
export type DimensionCardinality = "single" | "multi";
/**
 * P20 — a dimension declares what KIND of thing it records.
 *  - `intrinsic`   describes the keyword itself. Stable; no as-of.
 *  - `situational` describes the keyword's situation ON THIS SITE RIGHT NOW.
 *    Volatile, carries an as-of, and is re-derived by the engine on demand or
 *    on cadence. Dig Here rules are what fill it.
 * Same machinery either way — deliberately distinguished (never merged into
 * one undifferentiated list, and never split into two systems).
 */
export type DimensionNature = "intrinsic" | "situational";

/** One choice inside a dimension — `equipment_class` → `crt`. */
export interface FacetValue {
  value_id: string;
  /** Full identity, `dimension:value`. Never editable — data points at it. */
  slug: string;
  /** The value half of the identity, e.g. `crt`. */
  key: string;
  label: string;
  description: string | null;
  keyword_count: number;
  /**
   * The honest-decline option. The AI picks this instead of guessing, and the
   * DB refuses to retire the last one on a dimension.
   */
  abstain: boolean;
  /**
   * When this site's newest stamp on the value was written. Situational values
   * always render it — a present-tense claim with no time behind it is not a
   * fact, it is a guess (THE TRUE CURRENT STATUS law).
   */
  as_of: string | null;
  /** How many Dig Here rules fill this value (situational values only). */
  condition_matcher_count: number;
}

export interface FacetDimension {
  dimension_id: string;
  slug: string;
  label: string;
  description: string | null;
  scope: DimensionScope;
  cardinality: DimensionCardinality;
  nature: DimensionNature;
  site_id: string | null;
  is_system: boolean;
  value_count: number;
  keyword_count: number;
  rule_count: number;
  /**
   * HARD GATE. False when a dimension has fewer than two real choices: the AI
   * would be forced to stamp its only value on everything, so the classifier
   * is not offered it at all. (D37 follow-up 2 — found live, when a one-value
   * `equipment_class` put `crt_monitor` on `dod 5220.22-m`.)
   */
  is_ready: boolean;
  /**
   * QUALITY FLAG, never a gate. False when the dimension has no "not clear"
   * option, so the AI must pick even when the words do not say. Six platform
   * dimensions are in this state; gating on it would switch them off.
   */
  can_abstain: boolean;
  /** Plain-language sentence from the DB. Render as-is; do not paraphrase. */
  readiness_note: string;
  /** Dig Here rules feeding this dimension's values (situational only). */
  condition_matcher_count: number;
  /** Newest stamp across the dimension's values on this site. */
  situational_as_of: string | null;
  values: FacetValue[];
}

interface CatalogRow {
  dimension_id: string;
  slug: string;
  label: string;
  description: string | null;
  scope: string;
  cardinality: string;
  nature: string;
  site_id: string | null;
  is_system: boolean;
  value_count: number;
  keyword_count: number;
  rule_count: number;
  is_ready: boolean;
  can_abstain: boolean;
  readiness_note: string | null;
  condition_matcher_count: number;
  situational_as_of: string | null;
  facet_values: Json;
}

function toFacetValues(raw: Json): FacetValue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, Json>;
    const valueId = typeof row.value_id === "string" ? row.value_id : null;
    if (!valueId) return [];
    return [
      {
        value_id: valueId,
        slug: typeof row.slug === "string" ? row.slug : "",
        key: typeof row.key === "string" ? row.key : "",
        label: typeof row.label === "string" ? row.label : "",
        description:
          typeof row.description === "string" ? row.description : null,
        keyword_count:
          typeof row.keyword_count === "number" ? row.keyword_count : 0,
        abstain: row.abstain === true,
        as_of: typeof row.as_of === "string" ? row.as_of : null,
        condition_matcher_count:
          typeof row.condition_matcher_count === "number"
            ? row.condition_matcher_count
            : 0,
      },
    ];
  });
}

/**
 * Every dimension that applies to this site: the platform ones every tenant
 * shares, PLUS the ones this site authored. ONE call powers the whole screen.
 */
export async function getFacetDimensionCatalog(
  siteId: string,
  signal?: AbortSignal,
): Promise<FacetDimension[]> {
  const response = await (await seoDb())
    .rpc("facet_dimension_catalog", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(
    response.data,
    response.error,
    "load your keyword dimensions",
  ) as CatalogRow[];
  return rows.map((row) => ({
    dimension_id: row.dimension_id,
    slug: row.slug,
    label: row.label,
    description: row.description,
    scope: row.scope === "site" ? "site" : "platform",
    cardinality: row.cardinality === "multi" ? "multi" : "single",
    nature: row.nature === "situational" ? "situational" : "intrinsic",
    site_id: row.site_id,
    is_system: row.is_system,
    value_count: Number(row.value_count ?? 0),
    keyword_count: Number(row.keyword_count ?? 0),
    rule_count: Number(row.rule_count ?? 0),
    is_ready: row.is_ready !== false,
    can_abstain: row.can_abstain === true,
    readiness_note: row.readiness_note ?? "",
    condition_matcher_count: Number(row.condition_matcher_count ?? 0),
    situational_as_of: row.situational_as_of ?? null,
    values: toFacetValues(row.facet_values),
  }));
}

export interface DimensionDraft {
  slug: string;
  label: string;
  description: string | null;
  cardinality: DimensionCardinality;
  /**
   * Omit to leave an existing dimension's nature exactly as it is — an editor
   * that is only renaming must never silently reclassify what a dimension
   * records. New dimensions default to `intrinsic` server-side.
   */
  nature?: DimensionNature;
  /** The site that owns it. NULL is a PLATFORM dimension — super admins only. */
  siteId: string | null;
}

/**
 * Create or rename a dimension. The DB decides who may: a site dimension is
 * anyone with access to that site; a platform dimension is a fact every tenant
 * shares, so only a super admin may mint one.
 */
export async function upsertFacetDimension(
  draft: DimensionDraft,
): Promise<string> {
  const response = await (await seoDb()).rpc("facet_dimension_upsert", {
    p_slug: draft.slug,
    p_label: draft.label,
    p_description: draft.description ?? undefined,
    p_site_id: draft.siteId ?? undefined,
    p_cardinality: draft.cardinality,
    p_nature: draft.nature ?? undefined,
  });
  return assertGoverned(
    response.data,
    response.error,
    "save this dimension",
  ) as string;
}

export interface FacetValueDraft {
  dimension: string;
  value: string;
  label: string;
  description: string | null;
  siteId: string | null;
  position?: number | null;
}

/** Create or re-label a value on a dimension. */
export async function upsertFacetValue(
  draft: FacetValueDraft,
): Promise<string> {
  const response = await (await seoDb()).rpc("facet_value_upsert", {
    p_dimension: draft.dimension,
    p_value: draft.value,
    p_label: draft.label,
    p_description: draft.description ?? undefined,
    p_site_id: draft.siteId ?? undefined,
    p_position: draft.position ?? undefined,
  });
  return assertGoverned(
    response.data,
    response.error,
    "save this value",
  ) as string;
}

/**
 * Turn what a human typed into the machine identity the fact store FKs into.
 * Shown to the user before they commit — the identity is permanent, so it is
 * never a hidden derivation.
 */
export function toIdentitySlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/g, "")
    .slice(0, 60);
}

/** The DB's rule, mirrored ONLY to disable a button before a doomed round-trip. */
export const IDENTITY_PATTERN = /^[a-z][a-z0-9_]*$/;

// ── Matchers and worth — THE write paths (C9) ───────────────────────────────
//
// A matcher only FINDS keywords; the stamp is the truth (P19). A worth row is
// what a value is worth to THIS site; most values have none (P17). Both tables
// landed in C1 with the migration as their only writer — these two functions
// are the canonical client path, shared by the Dimensions editor and by
// keyword-meaning suggestion approval so approval never opens a second writer.

export interface MatcherDraft {
  siteId: string;
  /** `platform.categories.id` of the VALUE the matcher hangs on. */
  valueId: string;
  kind: MatcherKind;
  /** Text matchers. */
  pattern?: string | null;
  /** `place` / `fact` / `condition` targets — exactly one is set per kind. */
  placeId?: string | null;
  factValueId?: string | null;
  conditionRuleId?: string | null;
  origin?: MatcherOrigin;
  notes?: string | null;
  enabled?: boolean;
}

export type MatcherOrigin = "human" | "pack" | "agent" | "migration";

export type DimensionMatcherRow =
  Database["seo"]["Functions"]["dimension_matcher_upsert"]["Returns"][number];

/**
 * Create or update ONE matcher. Idempotent on (site, value, kind, target) in
 * the DB — re-adding the same rule updates the row instead of stamping every
 * matching keyword twice from two identical rules.
 */
export async function upsertDimensionMatcher(
  draft: MatcherDraft,
): Promise<DimensionMatcherRow> {
  const response = await (await seoDb()).rpc("dimension_matcher_upsert", {
    p_site_id: draft.siteId,
    p_value_id: draft.valueId,
    p_kind: draft.kind,
    p_pattern: draft.pattern ?? undefined,
    p_place_id: draft.placeId ?? undefined,
    p_fact_value_id: draft.factValueId ?? undefined,
    p_condition_rule_id: draft.conditionRuleId ?? undefined,
    p_origin: draft.origin ?? "human",
    p_notes: draft.notes ?? undefined,
    p_enabled: draft.enabled ?? true,
  });
  const rows = assertGoverned(
    response.data,
    response.error,
    "save this matcher",
  );
  const row = rows[0];
  if (!row) throw new Error("The matcher was not saved.");
  return row;
}

/**
 * THE DELETE CONTRACT (Arman, 2026-08-24): *"delete by default = remove
 * matches (One thing)."* Every function below removes the thing AND the
 * answers it was keeping, in ONE server transaction — never "deleted, now go
 * press Run matchers". Each returns the blast radius it actually caused, so
 * the UI can report it instead of guessing.
 *
 * None of them re-implements "what should be stamped": each re-derives the
 * touched keywords through `seo.fn_evaluate_matchers_internal`, the one
 * engine, so a stamp another live matcher still produces survives.
 */
export interface MatcherDeleteResult {
  deleted: boolean;
  keywordsTouched: number;
  answersRemoved: number;
  answersRestamped: number;
}

/**
 * Retire a matcher AND unstamp what it alone was keeping.
 *
 * Until 2026-08-24 this soft-deleted the row and stopped, leaving every
 * keyword it had stamped wearing an answer whose only reason no longer
 * existed — corrected only if someone happened to press "Run matchers now",
 * and invisible until then.
 */
export async function deleteDimensionMatcher(
  matcherId: string,
): Promise<MatcherDeleteResult> {
  const response = await (await seoDb()).rpc("dimension_matcher_delete", {
    p_matcher_id: matcherId,
  });
  const raw = assertGoverned(
    response.data,
    response.error,
    "remove this matcher",
  ) as unknown as Record<string, unknown>;
  return {
    deleted: Boolean(raw?.deleted),
    keywordsTouched: Number(raw?.keywords_touched ?? 0),
    answersRemoved: Number(raw?.answers_removed ?? 0),
    answersRestamped: Number(raw?.answers_restamped ?? 0),
  };
}

/**
 * ONE ROW OF THE MATCH REVIEW — what a matcher did to one keyword.
 *
 * `outcome` is the field the whole panel turns on:
 *   held      — this matcher's answer is the one the keyword wears.
 *   lost      — it matches, but another matcher's answer holds the dimension.
 *               The rule fired and changed nothing; `rivals` names who won.
 *   blocked   — a person's ruling holds it. Matchers never overwrite a human.
 *   unstamped — matches, and nothing holds the dimension yet.
 *
 * "19 keywords matched" in a toast could not tell these apart, which is why
 * a matcher reading 19 on Data Destruction was actually catching 27.
 */
export interface MatcherReviewRow {
  keywordId: string;
  phrase: string;
  clicks: number;
  impressions: number;
  outcome: "held" | "lost" | "blocked" | "unstamped";
  holdingValue: string | null;
  holdingSource: string | null;
  /** Other answers on THIS dimension whose matchers also catch the keyword. */
  rivals: string[];
  /** What the keyword wears on every OTHER dimension — the overlap context. */
  otherAnswers: { dimension: string; value: string; source: string | null }[];
}

export interface MatcherReview {
  rows: MatcherReviewRow[];
  /** Total keywords this matcher catches, before the display limit. */
  totalMatches: number;
}

/** Read-only: what `seo.matcher_match_review` reports. It never writes. */
export async function getMatcherReview(
  siteId: string,
  matcherId: string,
  limit = 300,
  signal?: AbortSignal,
): Promise<MatcherReview> {
  const response = await (await seoDb())
    .rpc("matcher_match_review", {
      p_site_id: siteId,
      p_matcher_id: matcherId,
      p_limit: limit,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const raw = assertGoverned(
    response.data,
    response.error,
    "review what this match caught",
  ) as unknown as Array<Record<string, unknown>>;
  const rows = (raw ?? []).map((row) => ({
    keywordId: String(row.keyword_id),
    phrase: String(row.phrase ?? ""),
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    outcome: String(row.outcome ?? "unstamped") as MatcherReviewRow["outcome"],
    holdingValue: (row.holding_value as string | null) ?? null,
    holdingSource: (row.holding_source as string | null) ?? null,
    rivals: Array.isArray(row.rivals) ? (row.rivals as string[]) : [],
    otherAnswers: Array.isArray(row.other_answers)
      ? (row.other_answers as MatcherReviewRow["otherAnswers"])
      : [],
  }));
  return {
    rows,
    totalMatches: Number(raw?.[0]?.total_matches ?? rows.length),
  };
}

export interface ValueArchiveResult {
  factsMoved: number;
  factsDropped: number;
  matchersRemoved: number;
}

/**
 * Retire ONE answer: its matchers go, its stamps go (or MOVE, if the caller
 * names an answer they should become instead), and the touched keywords are
 * re-derived.
 *
 * The DB refuses three things with a sentence written for the reader, and the
 * UI must show it verbatim rather than a generic failure: the honest-decline
 * ("not clear") option is never deletable, the last real answer on a dimension
 * is never deletable, and a value a value-rule still names must be pointed
 * somewhere else first.
 */
export async function archiveFacetValue(input: {
  dimensionSlug: string;
  valueKey: string;
  siteId: string;
  /** Move the answers here instead of dropping them. */
  reassignToKey?: string | null;
}): Promise<ValueArchiveResult> {
  const response = await (await seoDb()).rpc("facet_value_archive", {
    p_dimension: input.dimensionSlug,
    p_value: input.valueKey,
    p_reassign_to: input.reassignToKey ?? undefined,
    p_drop_facts: true,
    p_site_id: input.siteId,
  });
  const rows = assertGoverned(
    response.data,
    response.error,
    "retire this answer",
  ) as unknown as Array<Record<string, unknown>>;
  const row = Array.isArray(rows) ? rows[0] : (rows as Record<string, unknown>);
  return {
    factsMoved: Number(row?.facts_moved ?? 0),
    factsDropped: Number(row?.facts_dropped ?? 0),
    matchersRemoved: Number(row?.matchers_removed ?? 0),
  };
}

export interface DimensionArchiveResult {
  valuesRetired: number;
  factsDropped: number;
  matchersRemoved: number;
}

/**
 * Retire a WHOLE dimension — every answer, every matcher, every stamp.
 *
 * The DB refuses while a value rule still reads the dimension, because a rule
 * pointed at a retired question stops doing anything and says nothing.
 */
export async function archiveFacetDimension(input: {
  dimensionSlug: string;
  siteId: string;
}): Promise<DimensionArchiveResult> {
  const response = await (await seoDb()).rpc("facet_dimension_archive", {
    p_dimension: input.dimensionSlug,
    p_drop_facts: true,
    p_site_id: input.siteId,
  });
  const rows = assertGoverned(
    response.data,
    response.error,
    "retire this dimension",
  ) as unknown as Array<Record<string, unknown>>;
  const row = Array.isArray(rows) ? rows[0] : (rows as Record<string, unknown>);
  return {
    valuesRetired: Number(row?.values_retired ?? 0),
    factsDropped: Number(row?.facts_dropped ?? 0),
    matchersRemoved: Number(row?.matchers_removed ?? 0),
  };
}

export interface ValueMatcher {
  id: string;
  siteId: string;
  valueId: string;
  /**
   * Every kind the DB accepts (`dvm_kind_check`), not just the ones this
   * editor's "add" form writes — a value can already carry a `place` matcher
   * (geo editor), a `brand_identity` matcher (C3 migration) or a `condition`
   * matcher (Dig Here), and this list must show ALL of them honestly.
   */
  kind: string;
  pattern: string | null;
  placeId: string | null;
  factValueId: string | null;
  conditionRuleId: string | null;
  enabled: boolean;
  origin: string;
  notes: string | null;
  matchCount: number | null;
  lastEvaluatedAt: string | null;
  createdAt: string;
}

interface RawMatcherRow {
  id: string;
  site_id: string;
  value_id: string;
  kind: string;
  pattern: string | null;
  place_id: string | null;
  fact_value_id: string | null;
  condition_rule_id: string | null;
  enabled: boolean;
  origin: string;
  notes: string | null;
  match_count: number | null;
  last_evaluated_at: string | null;
  created_at: string;
}

function toValueMatcher(row: RawMatcherRow): ValueMatcher {
  return {
    id: row.id,
    siteId: row.site_id,
    valueId: row.value_id,
    kind: row.kind,
    pattern: row.pattern,
    placeId: row.place_id,
    factValueId: row.fact_value_id,
    conditionRuleId: row.condition_rule_id,
    enabled: row.enabled,
    origin: row.origin,
    notes: row.notes,
    matchCount: row.match_count,
    lastEvaluatedAt: row.last_evaluated_at,
    createdAt: row.created_at,
  };
}

/**
 * Every matcher hung on ONE value, on this site. A direct RLS-governed read
 * (`std_select` on `seo.dimension_value_matcher` — site editors/viewers only),
 * not a new RPC: THE MATCHER TABLE has no write path outside
 * `dimension_matcher_upsert` / `_delete`, but listing what already exists is
 * an ordinary scoped read (THE VIEW LAW).
 */
export async function getValueMatchers(
  siteId: string,
  valueId: string,
  signal?: AbortSignal,
): Promise<ValueMatcher[]> {
  const response = await (await seoDb())
    .from("dimension_value_matcher")
    .select(
      "id, site_id, value_id, kind, pattern, place_id, fact_value_id, condition_rule_id, enabled, origin, notes, match_count, last_evaluated_at, created_at",
    )
    .eq("site_id", siteId)
    .eq("value_id", valueId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(
    response.data,
    response.error,
    "load this answer's matchers",
  ) as RawMatcherRow[];
  return rows.map(toValueMatcher);
}

/**
 * EVERY matcher this site has written, across every dimension and every value,
 * in one scoped read — what makes the Dimensions screen searchable.
 *
 * WHY ALL OF THEM AT ONCE. Matchers are the only part of this site's meaning
 * that is not already on screen: they live one interaction deep, inside a
 * value's matcher door, so "is this term used anywhere in what we built?" was
 * unanswerable without opening every value one at a time (Arman, 2026-08-24:
 * *"I wanna see if we're doing anything with, say, e-stewards but I don't have
 * a quick and easy way of doing that."*). A site's whole matcher set is tens of
 * rows, not thousands — Data Destruction has 41 — so the honest implementation
 * is to read them and search in the browser, not to grow a search RPC for a
 * table this small.
 *
 * Same RLS-governed `std_select` as `getValueMatchers` (THE VIEW LAW): listing
 * what exists is an ordinary scoped read; writes still go only through
 * `dimension_matcher_upsert` / `_delete`.
 */
export async function getSiteMatchers(
  siteId: string,
  signal?: AbortSignal,
): Promise<ValueMatcher[]> {
  const response = await (await seoDb())
    .from("dimension_value_matcher")
    .select(
      "id, site_id, value_id, kind, pattern, place_id, fact_value_id, condition_rule_id, enabled, origin, notes, match_count, last_evaluated_at, created_at",
    )
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(
    response.data,
    response.error,
    "load this site's matchers",
  ) as RawMatcherRow[];
  return rows.map(toValueMatcher);
}

/**
 * How many (enabled or not) matchers each value in a dimension carries, in
 * ONE round trip — what lights up the "N matchers" door on every row in the
 * card without a query per value.
 */
export async function getMatcherCounts(
  siteId: string,
  valueIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (valueIds.length === 0) return counts;
  const response = await (await seoDb())
    .from("dimension_value_matcher")
    .select("value_id")
    .eq("site_id", siteId)
    .in("value_id", valueIds)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(
    response.data,
    response.error,
    "count these answers' matchers",
  ) as Array<{ value_id: string }>;
  for (const row of rows) {
    counts.set(row.value_id, (counts.get(row.value_id) ?? 0) + 1);
  }
  return counts;
}

export type WorthDraft = {
  siteId: string;
  valueId: string;
  /** `clear` REMOVES the row — "no worth at all" is the default state (P17). */
  effect: WorthEffect;
  /** Required for `add` and `scale`; the DB refuses a `scale` outside 0.05–5. */
  amount?: number | null;
  origin?: MatcherOrigin;
  notes?: string | null;
};

export type SiteValueWorthRow =
  Database["seo"]["Functions"]["site_value_worth_upsert"]["Returns"][number];

/** Set (or clear) what one value is worth to one site. */
export async function upsertSiteValueWorth(
  draft: WorthDraft,
): Promise<SiteValueWorthRow | null> {
  const response = await (await seoDb()).rpc("site_value_worth_upsert", {
    p_site_id: draft.siteId,
    p_value_id: draft.valueId,
    p_effect: draft.effect,
    p_amount: draft.amount ?? undefined,
    p_origin: draft.origin ?? "human",
    p_notes: draft.notes ?? undefined,
  });
  const rows = assertGoverned(response.data, response.error, "save this worth");
  return rows[0] ?? null;
}

// ── KI-001 — worth expressed as POINTS, not multipliers ─────────────────────
//
// P18: what a keyword IS contributes points (add ±N); only a RELATIVE QUALIFIER
// (free, cheap, DIY) scales what the keyword already earned. The migrated
// corpus is nearly all multipliers, so the three reads below let a person SEE
// their whole rulebook, be handed an honest points equivalent derived from this
// site's own score distribution, and watch what it does to real keywords before
// accepting it. P12 — nothing converts itself; the write is the ordinary
// `upsertSiteValueWorth`.

export type SiteWorthRow =
  Database["seo"]["Functions"]["gsc_site_worth_list"]["Returns"][number];

/** Every worth this site holds, with how much of its traffic wears each one. */
export async function listSiteWorth(
  siteId: string,
  window: { start: string; end: string },
  signal?: AbortSignal,
): Promise<SiteWorthRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_site_worth_list", {
      p_site_id: siteId,
      p_start: window.start,
      p_end: window.end,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(response.data, response.error, "read what your answers are worth");
}

/**
 * The arithmetic behind a proposed points equivalent — never a guess, and never
 * shown as a conclusion. Every field here is printed on screen so the reader can
 * follow the working: score = (baseline + adds) × factor, so dropping a factor f
 * and keeping the score means adding T × (f − 1) points, and T varies per
 * keyword. The proposal is the MEDIAN of that over the keywords the multiplier
 * is actually doing arithmetic on today.
 */
export interface WorthConvertBasis {
  error?: "no_worth" | "not_a_multiplier";
  message?: string;
  effect?: string;
  factor?: number;
  window_keywords?: number;
  stamped_keywords?: number;
  contributing_keywords?: number;
  /** Stamped keywords with no points yet: a multiplier does nothing to them, points would. */
  inert_keywords?: number;
  protected_keywords?: number;
  never_keywords?: number;
  total_before_factor?: { p25: number | null; median: number | null; p75: number | null };
  equivalent_add?: { p25: number | null; median: number | null; p75: number | null };
  score_delta_now?: { median: number | null };
  /** The median equivalent, rounded to the nearest 5 so a person can read it back. */
  proposed_add?: number;
  /** The ratified starter-pack formula (T pinned at 100), printed so the two can never disagree. */
  pack_reference_add?: number;
  basis?: "site_distribution" | "pack_formula";
}

export async function getWorthConvertBasis(
  siteId: string,
  valueId: string,
  window: { start: string; end: string },
  signal?: AbortSignal,
): Promise<WorthConvertBasis> {
  const response = await (await seoDb())
    .rpc("gsc_worth_convert_basis", {
      p_site_id: siteId,
      p_value_id: valueId,
      p_start: window.start,
      p_end: window.end,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(
    response.data,
    response.error,
    "work out what this multiplier is worth in points",
  ) as unknown as WorthConvertBasis;
}

/**
 * What a PROPOSED worth does to this site's real keywords — the same preview
 * family as `gsc_value_rule_preview` / `gsc_value_combo_preview`, finishing
 * through the same `gsc_value_preview_summarize`, so a worth proposal and a
 * combination proposal can never band a keyword differently.
 */
export interface WorthImpact extends RuleImpact {
  /** Keywords whose SCORE changes, whether or not the level does. */
  changed_score_keywords: number;
  effect: string;
  amount: number | null;
}

export async function previewSiteValueWorth(
  input: {
    siteId: string;
    valueId: string;
    effect: WorthEffect;
    amount: number | null;
    start: string;
    end: string;
    sample?: number;
  },
  signal?: AbortSignal,
): Promise<WorthImpact> {
  const response = await (await seoDb())
    .rpc("gsc_value_worth_preview", {
      p_site_id: input.siteId,
      p_value_id: input.valueId,
      p_effect: input.effect,
      p_amount: input.amount ?? undefined,
      p_start: input.start,
      p_end: input.end,
      p_sample: input.sample ?? 10,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertGoverned(
    response.data,
    response.error,
    "measure this worth against your keywords",
  ) as unknown as WorthImpact;
}
