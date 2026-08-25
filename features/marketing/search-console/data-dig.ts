/**
 * Dig Here data access — direct Supabase reads/writes on `seo.gsc_dig_rule`
 * (RLS: templates global-read, own rules owner-write, org rules org-read)
 * and the stateless `seo.gsc_perf_dig` RPC. The RPC always receives rule
 * CONTENTS (never a rule id) so unsaved editor drafts preview through the
 * exact same call as saved rules.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type { Json } from "@/types/database.types";
import type {
  GscDigResultRow,
  GscDigRuleRow,
  GscFilters,
  GscResolvedPeriods,
} from "@/features/marketing/search-console/types";
import type { GscDigRuleContent } from "@/features/marketing/search-console/lib/dig-rules";
import { serializeDigConditions } from "@/features/marketing/search-console/lib/dig-rules";
import { makeAssertData } from "@/utils/errors";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { fetchFeatureKnobValues } from "@/features/admin/limits/service";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your Search Console dig rules");

function cleanFilters(filters: GscFilters): Json {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.trim() !== "") {
      out[key] = value.trim();
    }
  }
  return out;
}

/**
 * Every rule the caller can see that is usable on `siteId` — templates and
 * rules with no site pin, plus rules pinned to exactly this site. RLS is
 * the access ceiling; this query declares its scope (THE VIEW LAW).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listDigRules(
  siteId: string,
  signal?: AbortSignal,
): Promise<GscDigRuleRow[]> {
  // siteId comes straight from ?site= — validate before splicing it into
  // the PostgREST .or() filter DSL (a stray comma/paren would rewrite it).
  if (!UUID_RE.test(siteId)) throw new Error("Invalid site id");
  const response = await (await seoDb())
    .from("gsc_dig_rule")
    .select("*")
    .is("deleted_at", null)
    .or(`site_id.is.null,site_id.eq.${siteId}`)
    .order("is_template", { ascending: false })
    .order("name", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export interface DigRuleInput {
  name: string;
  description: string | null;
  content: GscDigRuleContent;
  siteId: string | null;
  organizationId: string | null;
}

function ruleWriteColumns(
  input: Omit<DigRuleInput, "organizationId"> & { organizationId: string },
) {
  return {
    name: input.name,
    description: input.description,
    dimension: input.content.dimension,
    conditions: serializeDigConditions(input.content.conditions),
    sort_metric: input.content.sortMetric,
    sort_dir: input.content.sortDir,
    row_limit: input.content.rowLimit,
    base_filters: cleanFilters(input.content.baseFilters),
    traffic_class: input.content.trafficClass,
    level: input.content.level,
    site_id: input.siteId,
    organization_id: input.organizationId,
  };
}

export async function createDigRule(
  input: DigRuleInput,
): Promise<GscDigRuleRow> {
  const organizationId = await ensureOrgId(input.organizationId);
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("gsc_dig_rule")
    .insert({
      ...ruleWriteColumns({ ...input, organizationId }),
      created_by: session.user.id,
      updated_by: session.user.id,
    })
    .select("*")
    .single();
  return assertData(response.data, response.error, "save that dig rule");
}

export async function updateDigRule(
  ruleId: string,
  input: DigRuleInput,
): Promise<GscDigRuleRow> {
  const organizationId = await ensureOrgId(input.organizationId);
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("gsc_dig_rule")
    .update({
      ...ruleWriteColumns({ ...input, organizationId }),
      updated_by: session.user.id,
    })
    .eq("id", ruleId)
    .select("*")
    .single();
  return assertData(response.data, response.error, "update that dig rule");
}

/** Soft delete (RLS: owner only; templates are not deletable). */
export async function deleteDigRule(ruleId: string): Promise<void> {
  const response = await (await seoDb())
    .from("gsc_dig_rule")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", ruleId);
  if (response.error) throw new Error(response.error.message);
}

/** Adoption = copy a template's content into a new user-owned rule. */
export async function adoptDigTemplate(
  template: GscDigRuleRow,
  siteId: string | null,
  organizationId: string | null,
): Promise<GscDigRuleRow> {
  const resolvedOrganizationId = await ensureOrgId(organizationId);
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("gsc_dig_rule")
    .insert({
      name: template.name,
      description: template.description,
      dimension: template.dimension,
      conditions: template.conditions,
      sort_metric: template.sort_metric,
      sort_dir: template.sort_dir,
      row_limit: template.row_limit,
      base_filters: template.base_filters,
      traffic_class: template.traffic_class,
      level: template.level,
      site_id: siteId,
      organization_id: resolvedOrganizationId,
      created_by: session.user.id,
      updated_by: session.user.id,
    })
    .select("*")
    .single();
  return assertData(response.data, response.error, "adopt that dig template");
}

export interface GscDigResult {
  rows: GscDigResultRow[];
  total: number;
}

/** Run rule CONTENTS through `seo.gsc_perf_dig` (stateless; drafts welcome). */
export async function runGscDig(
  siteId: string,
  periods: GscResolvedPeriods,
  content: GscDigRuleContent,
  signal?: AbortSignal,
): Promise<GscDigResult> {
  const response = await (await seoDb())
    .rpc("gsc_perf_dig", {
      p_site_id: siteId,
      p_dimension: content.dimension,
      p_start: periods.current.start,
      p_end: periods.current.end,
      ...(periods.compare
        ? {
            p_compare_start: periods.compare.start,
            p_compare_end: periods.compare.end,
          }
        : {}),
      p_conditions: serializeDigConditions(content.conditions),
      p_filters: cleanFilters(content.baseFilters),
      p_sort: content.sortMetric,
      p_sort_dir: content.sortDir,
      p_limit: content.rowLimit,
      ...(content.trafficClass
        ? { p_traffic_class: content.trafficClass }
        : {}),
      ...(content.level ? { p_level: content.level } : {}),
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error, "run that dig");
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/* ───────────────────────────────────────────────────────────────────────────
 * C5 — SAVE MATCHES AS A STAMP
 *
 * A dig rule is a condition MATCHER on a situational dimension's value: the
 * rule keeps finding what it always found, and the engine writes what it
 * finds onto the keywords as a stamp with an as-of. All three calls go
 * through SECURITY DEFINER RPCs — the matcher table is never written from
 * the browser, and re-evaluation is the DB's job, not a loop up here.
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 * ───────────────────────────────────────────────────────────────────────── */

/** One saved stamp: which value a rule fills, how full it is, how fresh. */
export interface DigRuleStamp {
  matcher_id: string;
  rule_id: string | null;
  rule_name: string | null;
  dimension_id: string;
  dimension: string;
  dimension_label: string;
  value_id: string;
  value: string;
  value_label: string;
  enabled: boolean;
  last_evaluated_at: string | null;
  match_count: number | null;
  stamp_count: number;
  /** When the SEGMENT was last worked out (the matcher's own run time) — not
   *  when one keyword happened to join it. */
  as_of: string | null;
  /** > 0 while a large first fill is still in progress. */
  fill_remaining: number;
}

/** Every value this site's dig rules fill (optionally just one rule's). */
export async function listDigRuleStamps(
  siteId: string,
  ruleId?: string | null,
  signal?: AbortSignal,
): Promise<DigRuleStamp[]> {
  const response = await (await seoDb())
    .rpc("gsc_dig_rule_stamps", {
      p_site_id: siteId,
      ...(ruleId ? { p_rule_id: ruleId } : {}),
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(
    response.data,
    response.error,
    "read what your dig rules save",
  ) as DigRuleStamp[];
}

/** Attach a rule to a situational value. Returns the matcher id. */
export async function saveDigRuleStamp(
  siteId: string,
  ruleId: string,
  valueId: string,
): Promise<string> {
  const response = await (await seoDb()).rpc("gsc_dig_rule_stamp_upsert", {
    p_site_id: siteId,
    p_rule_id: ruleId,
    p_value_id: valueId,
  });
  return assertData(
    response.data,
    response.error,
    "save this rule's matches as a stamp",
  ) as string;
}

/** Detach: the matcher goes and so do the stamps it put there (never pins). */
export async function removeDigRuleStamp(
  siteId: string,
  matcherId: string,
): Promise<{ stamps_removed: number }> {
  const response = await (await seoDb()).rpc("gsc_dig_rule_stamp_remove", {
    p_site_id: siteId,
    p_matcher_id: matcherId,
  });
  const result = assertData(
    response.data,
    response.error,
    "remove this saved stamp",
  ) as { stamps_removed?: number };
  return { stamps_removed: Number(result?.stamps_removed ?? 0) };
}

export interface ConditionEvaluationResult {
  matcher_id: string;
  rule?: string;
  dimension?: string;
  value?: string;
  /** Every keyword the rule matches — the whole segment, not a page of it. */
  matched?: number;
  stamped?: number;
  removed?: number;
  /** Still to stamp on a later pass. 0 = the segment is fully filled. */
  remaining?: number;
  complete?: boolean;
  /** How many of them the Dig Here TABLE shows. Context, never a cap. */
  table_row_limit?: number;
  used_compare?: boolean;
  error?: string;
}

/**
 * What the autonomy ladder said when the engine was asked to run (KI-044).
 * `seo.fn_autonomy_gate` is the ONE read; this is its shape on the wire.
 */
export interface AutonomyVerdict {
  capability: string;
  label: string;
  mode:
    | "auto_platform"
    | "auto_org"
    | "review_timeout"
    | "review_required"
    | "off";
  decision: "apply" | "propose" | "propose_only" | "off";
  source: string;
  scope: string;
  timeout_hours: number | null;
  enforced: boolean;
  /** The sentence to show a human when the engine declined to write. */
  refusal: string | null;
}

export interface ConditionEvaluation {
  window: { start: string; end: string; compare_start: string; compare_end: string };
  matchers: number;
  stamped: number;
  removed: number;
  /** > 0 means the fill did not finish (see `evaluateConditionMatchers`). */
  remaining: number;
  /** The knob the server bounded each pass by (`seo.situational_stamps`). */
  writes_per_pass?: number;
  /** How many round-trips this took. 1 for every segment measured so far. */
  passes?: number;
  evaluated_at: string;
  results: ConditionEvaluationResult[];
  /** Which autonomy mode the engine obeyed, and what it decided to do. */
  autonomy?: AutonomyVerdict;
  /** Set when the mode is `off` — the engine did not run at all. */
  skipped?: string;
  /** Mode 3's bounded catch-up: proposals nobody answered in time. */
  timeout_pass?: { applied: number; skipped: number; waited_hours: number };
}

/**
 * Re-derive situational stamps. Scope it to ONE matcher, ONE dimension, or
 * (deliberately) the site's whole situational set; the window defaults to the
 * site's current one server-side. THE SCOPE RULE lives in the RPC — it never
 * walks more than one window.
 *
 * ONE PRESS FINISHES THE JOB. The RPC bounds how much it writes per call
 * (`seo.situational_stamps.writes_per_pass`, a knob) because the `authenticated`
 * role's statement timeout is 8 seconds and stamp writes cost ~0.32 ms each —
 * a first fill of the largest window in the fleet would not fit in one
 * round-trip. It reports what is left instead of truncating, and this loop
 * finishes it, so "remaining" is a fact about round-trips and never about what
 * the segment holds. A steady-state re-evaluation writes nothing and returns
 * in one pass.
 */
/**
 * The pass ceiling is a KNOB (`seo.situational_stamps.max_passes_per_run`), not
 * the constant that used to live here. A ceiling in code is not a ceiling an
 * admin can move. The fallback exists only so a missing knob row degrades to
 * the measured value rather than looping forever.
 */
const MAX_PASSES_FALLBACK = 25;

async function maxEvaluationPasses(): Promise<number> {
  const knobs = await fetchFeatureKnobValues("seo.situational_stamps");
  const value = Number(knobs?.max_passes_per_run);
  return Number.isFinite(value) && value > 0 ? value : MAX_PASSES_FALLBACK;
}

async function evaluateOnce(
  siteId: string,
  scope: { matcherId?: string; dimensionId?: string },
): Promise<ConditionEvaluation> {
  const response = await (await seoDb()).rpc("fn_evaluate_condition_matchers", {
    p_site_id: siteId,
    ...(scope.matcherId ? { p_matcher_ids: [scope.matcherId] } : {}),
    ...(scope.dimensionId ? { p_dimension_id: scope.dimensionId } : {}),
  });
  return assertData(
    response.data,
    response.error,
    "re-evaluate these stamps",
  ) as unknown as ConditionEvaluation;
}

export async function evaluateConditionMatchers(
  siteId: string,
  scope: { matcherId?: string; dimensionId?: string } = {},
): Promise<ConditionEvaluation> {
  const maxPasses = await maxEvaluationPasses();
  let total: ConditionEvaluation | null = null;
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const current = await evaluateOnce(siteId, scope);
    // AUTONOMY (KI-044). `off` never ran; a review mode wrote proposals and
    // stamped nothing. Neither has anything left to fill, so looping would be
    // one wasted round-trip per pass and a "remaining: 0" that means nothing.
    if (current.skipped || (current.autonomy && current.autonomy.decision !== "apply")) {
      return { ...current, passes: pass };
    }
    total = total
      ? {
          // The latest pass describes the CURRENT state (matched, remaining,
          // complete); the counts of work done accumulate across passes.
          ...current,
          stamped: total.stamped + current.stamped,
          removed: total.removed + current.removed,
          results: current.results.map((row) => {
            const prior = total?.results.find((r) => r.matcher_id === row.matcher_id);
            return {
              ...row,
              stamped: (prior?.stamped ?? 0) + (row.stamped ?? 0),
              removed: (prior?.removed ?? 0) + (row.removed ?? 0),
            };
          }),
        }
      : current;
    total.passes = pass;
    if (current.remaining <= 0) return total;
  }
  // Past the pass ceiling the segment is genuinely still filling — say so
  // rather than returning a number that reads as finished.
  return total as ConditionEvaluation;
}
