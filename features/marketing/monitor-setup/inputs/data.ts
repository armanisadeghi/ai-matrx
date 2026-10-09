/**
 * News trackers as a person reads them: what the news engine receives for each
 * tracker (topics, brief, competitors, brand description, business facts) plus
 * its last 30 days of runs and cost.
 *
 * ONE read door, `seo.news_tracker_inputs(p_tracker_id, p_include_archived)`
 * (SECURITY DEFINER; rows for the tracker's organization admins, every tracker
 * for a platform admin in the admin lane). It mirrors aidream
 * `services/news/client_context.py::build_client_context` field for field:
 * competitors = brand profile ∪ tracker list (case-insensitive), the brief =
 * the Source behind `brief_source_id` and is EMPTY when only template comments
 * and headings remain, facts = the brand's live `web.business_fact` rows.
 * Cost = the whole execution tree of every `news_monitor_run` in 30 days.
 *
 * ONE write door, `seo.news_tracker_set_state(p_tracker_ids, p_action)`:
 * pause / resume / archive (soft delete). It moves the tracker AND its
 * schedule (workflow.trigger), because scheduled runs follow the trigger.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

export type TrackerStatus = "active" | "paused" | "archived";
export type TrackerReadiness = "missing" | "thin" | "ready";
export type TrackerAction = "pause" | "resume" | "archive";

export interface TrackerFact {
  id: string;
  kind: string;
  label: string | null;
  text: string;
  title: string | null;
  url: string | null;
}

export interface NewsTrackerInputs {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  brandId: string | null;
  brandName: string | null;
  siteId: string | null;
  status: TrackerStatus;
  costPausedAt: string | null;
  costPausedReason: string | null;
  isDisposable: boolean;
  lenses: string[];
  topics: string[];
  searchTerms: string[];
  excludeTerms: string[];
  briefSourceId: string | null;
  briefText: string;
  briefIsEmpty: boolean;
  competitors: string[];
  brandDescription: string;
  facts: TrackerFact[];
  runs30d: number;
  cost30dUsd: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  readiness: TrackerReadiness;
  /** What the relevance check is missing, in a person's words. */
  gaps: string[];
}

/** A description shorter than this tells the judge almost nothing. */
export const THIN_DESCRIPTION_CHARS = 80;

const DISPOSABLE_NAME = /\bdisposable\b|^\s*\[(test|disposable)\]/i;

export function isDisposableTracker(name: string, isFixture: boolean): boolean {
  return isFixture || DISPOSABLE_NAME.test(name);
}

export function trackerStatus(row: {
  deletedAt: string | null;
  isActive: boolean;
  costPausedAt: string | null;
}): TrackerStatus {
  if (row.deletedAt) return "archived";
  if (!row.isActive || row.costPausedAt) return "paused";
  return "active";
}

/**
 * Red when the relevance check judges with nothing to judge against (no
 * topics or no brief); amber when its company picture is thin.
 */
export function trackerReadiness(input: {
  topics: number;
  briefIsEmpty: boolean;
  descriptionChars: number;
  competitors: number;
  facts: number;
}): { readiness: TrackerReadiness; gaps: string[] } {
  const missing: string[] = [];
  if (input.topics === 0) missing.push("No topics");
  if (input.briefIsEmpty) missing.push("No brief");
  const thin: string[] = [];
  if (input.descriptionChars === 0) thin.push("No brand description");
  else if (input.descriptionChars < THIN_DESCRIPTION_CHARS)
    thin.push("Short brand description");
  if (input.competitors === 0) thin.push("No competitors");
  if (input.facts === 0) thin.push("No business facts");
  if (missing.length) return { readiness: "missing", gaps: [...missing, ...thin] };
  if (thin.length) return { readiness: "thin", gaps: thin };
  return { readiness: "ready", gaps: [] };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function factsOf(raw: unknown): TrackerFact[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): TrackerFact[] => {
    if (!item || typeof item !== "object") return [];
    const fact = item as Record<string, unknown>;
    const id = text(fact.id);
    if (!id) return [];
    return [
      {
        id,
        kind: text(fact.kind) ?? "other",
        label: text(fact.label),
        text: text(fact.text) ?? "",
        title: text(fact.title),
        url: text(fact.url),
      },
    ];
  });
}

type InputsRow = {
  id: string;
  name: string;
  organization_id: string;
  organization_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  site_id: string | null;
  is_active: boolean;
  auto_run_paused_at: string | null;
  auto_run_paused_reason: string | null;
  deleted_at: string | null;
  is_fixture: boolean;
  lenses: string[] | null;
  topics: string[] | null;
  search_terms: string[] | null;
  exclude_terms: string[] | null;
  brief_source_id: string | null;
  brief_text: string | null;
  brief_is_empty: boolean;
  competitor_names: string[] | null;
  brand_description: string | null;
  facts: unknown;
  runs_30d: number;
  cost_30d_usd: number | string | null;
  last_run_at: string | null;
  last_run_status: string | null;
};

export function toTrackerInputs(row: InputsRow): NewsTrackerInputs {
  const topics = row.topics ?? [];
  const competitors = row.competitor_names ?? [];
  const facts = factsOf(row.facts);
  const brandDescription = (row.brand_description ?? "").trim();
  const { readiness, gaps } = trackerReadiness({
    topics: topics.length,
    briefIsEmpty: row.brief_is_empty,
    descriptionChars: brandDescription.length,
    competitors: competitors.length,
    facts: facts.length,
  });
  const costPausedAt = row.auto_run_paused_at || null;
  return {
    id: row.id,
    name: row.name,
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    brandId: row.brand_id || null,
    brandName: row.brand_name || null,
    siteId: row.site_id || null,
    status: trackerStatus({
      deletedAt: row.deleted_at || null,
      isActive: row.is_active,
      costPausedAt,
    }),
    costPausedAt,
    costPausedReason: row.auto_run_paused_reason || null,
    isDisposable: isDisposableTracker(row.name, row.is_fixture),
    lenses: row.lenses ?? [],
    topics,
    searchTerms: row.search_terms ?? [],
    excludeTerms: row.exclude_terms ?? [],
    briefSourceId: row.brief_source_id || null,
    briefText: row.brief_text ?? "",
    briefIsEmpty: row.brief_is_empty,
    competitors,
    brandDescription,
    facts,
    runs30d: row.runs_30d ?? 0,
    cost30dUsd: Number(row.cost_30d_usd ?? 0) || 0,
    lastRunAt: row.last_run_at || null,
    lastRunStatus: row.last_run_status || null,
    readiness,
    gaps,
  };
}

export const trackerInputsKeys = {
  all: ["marketing", "news-tracker-inputs"] as const,
  list: (includeArchived: boolean) =>
    [...trackerInputsKeys.all, "list", includeArchived] as const,
  one: (trackerId: string) => [...trackerInputsKeys.all, "one", trackerId] as const,
};

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

function failure(error: { message?: string } | null, what: string): Error {
  return new Error(`Could not ${what}: ${error?.message ?? "unknown error"}`);
}

export async function listTrackerInputs(
  opts: { trackerId?: string | null; includeArchived?: boolean } = {},
): Promise<NewsTrackerInputs[]> {
  const response = await (await seoDb()).rpc("news_tracker_inputs", {
    p_tracker_id: opts.trackerId ?? undefined,
    p_include_archived: opts.includeArchived ?? false,
  });
  if (response.error) throw failure(response.error, "load the news monitors");
  return (response.data ?? []).map((row) => toTrackerInputs(row));
}

export async function setTrackerState(
  trackerIds: string[],
  action: TrackerAction,
): Promise<{ id: string; status: string }[]> {
  const response = await (await seoDb()).rpc("news_tracker_set_state", {
    p_tracker_ids: trackerIds,
    p_action: action,
  });
  if (response.error) throw failure(response.error, `${action} these monitors`);
  return response.data ?? [];
}

export function useTrackerInputsList(includeArchived: boolean) {
  return useQuery({
    queryKey: trackerInputsKeys.list(includeArchived),
    queryFn: () => listTrackerInputs({ includeArchived }),
  });
}

export function useTrackerInputs(trackerId: string) {
  return useQuery({
    queryKey: trackerInputsKeys.one(trackerId),
    queryFn: async () =>
      (await listTrackerInputs({ trackerId }))[0] ?? null,
    enabled: Boolean(trackerId),
  });
}

export function useInvalidateTrackerInputs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trackerInputsKeys.all });
}
