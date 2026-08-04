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

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data");
  return data;
}

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

function ruleWriteColumns(input: DigRuleInput) {
  return {
    name: input.name,
    description: input.description,
    dimension: input.content.dimension,
    conditions: serializeDigConditions(input.content.conditions),
    sort_metric: input.content.sortMetric,
    sort_dir: input.content.sortDir,
    row_limit: input.content.rowLimit,
    base_filters: cleanFilters(input.content.baseFilters),
    site_id: input.siteId,
    organization_id: input.organizationId,
  };
}

export async function createDigRule(
  input: DigRuleInput,
): Promise<GscDigRuleRow> {
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("gsc_dig_rule")
    .insert({
      ...ruleWriteColumns(input),
      created_by: session.user.id,
      updated_by: session.user.id,
    })
    .select("*")
    .single();
  return assertData(response.data, response.error);
}

export async function updateDigRule(
  ruleId: string,
  input: DigRuleInput,
): Promise<GscDigRuleRow> {
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("gsc_dig_rule")
    .update({ ...ruleWriteColumns(input), updated_by: session.user.id })
    .eq("id", ruleId)
    .select("*")
    .single();
  return assertData(response.data, response.error);
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
      site_id: siteId,
      organization_id: organizationId,
      created_by: session.user.id,
      updated_by: session.user.id,
    })
    .select("*")
    .single();
  return assertData(response.data, response.error);
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
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}
