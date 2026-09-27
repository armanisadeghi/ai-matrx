// features/education/assessment/data/assessmentListService.ts
//
// The quiz / practice-test library's server-side list reads —
// `education.assessment_list_scoped`, `assessment_list_counts` and
// `assessment_list_facets` (migrations/assessment_list_scoped.sql, copied from
// the flashcards family per lib/list-scope/FEATURE.md). Kind, lane, archive
// axis, search, column filters, sort, paging, counts and facet options all run
// in Postgres, so the list never loads the whole library into the browser.
//
// SECURITY INVOKER RPCs: the table's RLS is the ceiling; each call declares
// its lane (THE VIEW LAW).

import { displayTitle } from "@/components/markdown-core/plain-title";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { AssessmentKind } from "./types";

const EDU = () => supabase.schema("education");

// The RPCs are newer than the generated types; call them through a narrow
// structural view of `rpc` rather than widening every call site.
type RpcResult = PromiseLike<{
  data: unknown;
  error: { message?: string } | null;
}>;
const rpc = (fn: string, args: Record<string, unknown>): RpcResult =>
  (EDU() as unknown as { rpc: (f: string, a: Record<string, unknown>) => RpcResult }).rpc(fn, args);

export type AssessmentLane = "mine" | "orgs" | "shared" | "public";
export type AssessmentArchive = "active" | "archived" | "all";

/** One row of the library as the list RPC returns it (titles in display form). */
export interface AssessmentListRow {
  id: string;
  organization_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  visibility: string;
  assessment_kind: AssessmentKind;
  title: string;
  description: string | null;
  status: string;
  topic: string | null;
  source_title: string | null;
  exam_type: string | null;
  depth: string | null;
  time_limit_seconds: number | null;
  question_count: number;
}

export interface AssessmentListQuery {
  kind: AssessmentKind;
  lane: AssessmentLane;
  orgId?: string | null;
  search: string;
  filters: Record<string, unknown>;
  archived: AssessmentArchive;
}

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(
    `Your assessments could not be ${what}: ${error?.message ?? "unknown error"}`,
  );
}

/**
 * Stored titles and topics may still carry markdown written before the
 * projection existed ("# AP Chemistry…"); the list shows their display form.
 */
function cleanRow(row: AssessmentListRow): AssessmentListRow {
  const title = displayTitle(row.title);
  const topic = row.topic ? displayTitle(row.topic) : null;
  return {
    ...row,
    title,
    topic,
    source_title: row.source_title ? displayTitle(row.source_title) : null,
    question_count: Number(row.question_count ?? 0),
  };
}

export async function fetchAssessmentPage(
  query: AssessmentListQuery,
  sort: { sort: string; ascending: boolean; limit: number; offset: number },
): Promise<{ rows: AssessmentListRow[]; total: number }> {
  const { data, error } = await rpc("assessment_list_scoped", {
    p_kind: query.kind,
    p_scope: query.lane,
    p_org_id: query.orgId ?? null,
    p_search: query.search,
    p_filters: query.filters as Json,
    p_archived: query.archived,
    p_sort: sort.sort,
    p_ascending: sort.ascending,
    p_limit: sort.limit,
    p_offset: sort.offset,
  });
  if (error) fail("listed", error);
  const rows = (data ?? []) as (AssessmentListRow & { total_count: number })[];
  return {
    rows: rows.map(({ total_count: _total, ...row }) => cleanRow(row)),
    total: Number(rows[0]?.total_count ?? 0),
  };
}

export async function fetchAssessmentLaneCounts(
  query: Omit<AssessmentListQuery, "lane" | "orgId">,
): Promise<Record<AssessmentLane, number>> {
  const { data, error } = await rpc("assessment_list_counts", {
    p_kind: query.kind,
    p_search: query.search,
    p_filters: query.filters as Json,
    p_archived: query.archived,
  });
  if (error) fail("counted", error);
  const out: Record<AssessmentLane, number> = { mine: 0, orgs: 0, shared: 0, public: 0 };
  for (const row of (data ?? []) as { scope: string; total: number }[]) {
    if (row.scope in out) out[row.scope as AssessmentLane] = Number(row.total);
  }
  return out;
}

export async function fetchAssessmentFacets(
  query: AssessmentListQuery,
): Promise<Record<string, { value: string; count: number }[]>> {
  const { data, error } = await rpc("assessment_list_facets", {
    p_kind: query.kind,
    p_scope: query.lane,
    p_org_id: query.orgId ?? null,
    p_search: query.search,
    p_filters: query.filters as Json,
    p_archived: query.archived,
  });
  if (error) fail("filtered", error);
  const out: Record<string, { value: string; count: number }[]> = {};
  for (const row of (data ?? []) as { facet: string; value: string; total: number }[]) {
    (out[row.facet] ??= []).push({ value: row.value, count: Number(row.total) });
  }
  return out;
}

/**
 * The person's own assessments of one kind that an agent write names — by id,
 * or (for create's duplicate check) by title — read narrowly, never the whole
 * library.
 */
export async function fetchOwnAssessmentsFor(input: {
  userId: string;
  kind: AssessmentKind;
  ids: string[];
  titles: string[];
}): Promise<{ id: string; title: string; archived: boolean }[]> {
  const out = new Map<string, { id: string; title: string; archived: boolean }>();
  const add = (rows: { id: string; title: string; deleted_at: string | null }[] | null) => {
    for (const r of rows ?? [])
      out.set(r.id, { id: r.id, title: displayTitle(r.title), archived: r.deleted_at !== null });
  };
  const ids = input.ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length > 0) {
    const { data, error } = await EDU()
      .from("assessment")
      .select("id, title, deleted_at")
      .eq("created_by", input.userId)
      .eq("assessment_kind", input.kind)
      .in("id", ids);
    if (error) fail("read", error);
    add(data as { id: string; title: string; deleted_at: string | null }[] | null);
  }
  for (const title of input.titles.filter((t) => t.trim())) {
    const { data, error } = await EDU()
      .from("assessment")
      .select("id, title, deleted_at")
      .eq("created_by", input.userId)
      .eq("assessment_kind", input.kind)
      .is("deleted_at", null)
      .ilike("title", title.trim().replace(/[\\%_]/g, (c) => `\\${c}`));
    if (error) fail("read", error);
    add(data as { id: string; title: string; deleted_at: string | null }[] | null);
  }
  return [...out.values()];
}
