// features/workflow-runtime/browse/service.ts
//
// Direct browser → Supabase. No Next.js hop, no Python hop: a list is a plain
// DB read the browser is entitled to make (CLAUDE.md § Data flow), and the
// Python server is the brain, never a database gateway.
//
// Five calls:
//   fetchWorkflowBrowsePage   — the rows for ONE page + the true total
//   fetchWorkflowScopeCounts  — every scope tab's true total, one round trip
//   fetchWorkflowFacets       — filter OPTIONS with counts for every finite column
//   saveWorkflowRowEdits      — inline table edits, one statement per row
//   duplicateWorkflow         — copy a definition (returns the new id: a door)
//
// The RPC family (wfx_*) is hand-written from the template in
// lib/list-scope/FEATURE.md — see migrations/wfx_list_scoped.sql.

import { supabase } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { scopeOrgId } from "@/lib/list-scope/types";
import type { WorkflowBrowseRow, WorkflowRowEdit } from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

/** The filter bag as the RPC wants it. Empty object = no column filters. */
function filtersJson(query: EntityListQuery): Json {
  return query.filters as unknown as Json;
}

export async function fetchWorkflowBrowsePage(
  query: EntityListQuery,
  opts: EntityListSort,
): Promise<EntityListPage<WorkflowBrowseRow>> {
  const { data, error } = await supabase.rpc("wfx_list_scoped", {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_sort: opts.sort,
    p_dir: opts.direction,
    p_favorites_first: opts.favoritesFirst,
    p_archived: query.archived,
    p_filters: filtersJson(query),
    p_limit: opts.pageSize,
    p_offset: (query.page - 1) * opts.pageSize,
  });

  if (error) throw pgError(error);

  const rows = (data ?? []) as WorkflowBrowseRow[];
  // total_count is a window function over the filtered set — identical on every
  // row. Zero rows legitimately means zero matches, not "unknown".
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

export async function fetchWorkflowScopeCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const { data, error } = await supabase.rpc("wfx_list_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_archived: query.archived,
    p_filters: filtersJson(query),
  });

  if (error) throw pgError(error);

  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  for (const row of data ?? []) {
    const total = Number(row.total ?? 0);
    const kind = row.scope;
    if (kind !== "mine" && kind !== "orgs" && kind !== "shared" && kind !== "public") {
      continue;
    }
    // A narrow_id means "one org inside this scope"; no id means the scope's
    // own blended total.
    if (row.narrow_id) {
      (counts.narrow[kind] ??= []).push({
        id: row.narrow_id,
        label: row.label ?? "Unnamed",
        count: total,
      });
      continue;
    }
    counts.byKind[kind] = total;
  }
  return counts;
}

/**
 * Filter options for every finite-valued column, for the current scope +
 * search. Deliberately NOT narrowed by the column selection itself — a facet
 * list that hides the option you just deselected traps the user in their own
 * filter.
 */
export async function fetchWorkflowFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await supabase.rpc("wfx_list_facets", {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_archived: query.archived,
  });

  if (error) throw pgError(error);

  const byKind: EntityFacets["byKind"] = {};
  for (const row of data ?? []) {
    (byKind[row.kind] ??= []).push({
      value: row.value,
      count: Number(row.total ?? 0),
    });
  }

  // Most-used first: the useful end of a long tag list is the top of it.
  for (const values of Object.values(byKind)) {
    values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }

  return { byKind };
}

/**
 * Persist inline table edits. One UPDATE per row — these are 1-4 scalar fields
 * on a row the user can see, not a bulk job. RLS authorizes the write
 * (`std_update`: owner, or an editor grant).
 */
export async function saveWorkflowRowEdits(
  workflowId: string,
  edit: WorkflowRowEdit,
): Promise<void> {
  // Typed against the generated table Update shape — never a loose bag.
  const patch: Database["workflow"]["Tables"]["definition"]["Update"] = {};
  if (edit.name !== undefined) patch.name = edit.name.trim();
  if (edit.description !== undefined)
    patch.description = edit.description?.trim() || null;
  if (edit.category !== undefined) patch.category = edit.category || null;
  if (edit.tags !== undefined) patch.tags = edit.tags;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .schema("workflow")
    .from("definition")
    .update(patch)
    .eq("id", workflowId);

  if (error) throw pgError(error);
}

/** Flip one boolean/scalar the row menu owns (favorite, archived, name). */
export async function setWorkflowFlag(
  workflowId: string,
  patch: Database["workflow"]["Tables"]["definition"]["Update"],
): Promise<void> {
  const { error } = await supabase
    .schema("workflow")
    .from("definition")
    .update(patch)
    .eq("id", workflowId);
  if (error) throw pgError(error);
}

/**
 * Soft delete. `deleted_at` is the trash marker across this platform — the row
 * leaves every list (the RPC filters `deleted_at IS NULL`) without destroying
 * the runs that point at it.
 */
export async function deleteWorkflow(workflowId: string): Promise<void> {
  await setWorkflowFlag(workflowId, { deleted_at: new Date().toISOString() });
}

/**
 * Copy a definition. Returns the NEW id so the caller can hand the user a door
 * to it — a duplicate the user cannot reach is a dead end.
 *
 * `source_definition_id` + `source_snapshot_at` record the lineage the table
 * already models, so the copy knows where it came from.
 */
export async function duplicateWorkflow(
  workflowId: string,
): Promise<{ id: string; name: string }> {
  const { data: source, error: readError } = await supabase
    .schema("workflow")
    .from("definition")
    .select(
      "name,description,nodes,edges,viewport,channels,strict_channels,entry_nodes,metadata,variables,category,tags,organization_id,visibility,max_concurrent_runs",
    )
    .eq("id", workflowId)
    .single();

  if (readError) throw pgError(readError);
  if (!source) throw new Error("That workflow could no longer be read.");

  const { data: created, error: writeError } = await supabase
    .schema("workflow")
    .from("definition")
    .insert({
      ...source,
      name: `${source.name} (copy)`,
      source_definition_id: workflowId,
      source_snapshot_at: new Date().toISOString(),
      // A copy starts un-starred and un-archived: the star is a statement about
      // the original, and inheriting "archived" would file the new copy
      // straight into the trash-adjacent view the user just left.
      is_favorite: false,
      is_archived: false,
    })
    .select("id,name")
    .single();

  if (writeError) throw pgError(writeError);
  if (!created) throw new Error("The copy was not created.");
  return { id: created.id, name: created.name };
}
