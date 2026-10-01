// features/transcripts/browse/service.ts
//
// Direct browser → Supabase (CLAUDE.md § Data flow). The entity-list service
// triple over the trx_* RPC set, replacing the four hub queries + two
// enrichment calls in the retired transcriptsHubService.
//
// Transcripts has no favorite axis (favoritesFirst is ignored). THE ARCHIVED-
// ITEMS LAW's axis rides `p_filters.archived` (active | archived | all) — the
// list, its lane counts and its facets read the same rows; `trx_list_scoped`
// returns `is_archived` per row and `trx_list_facets` takes `p_archived`.

import { supabase } from "@/utils/supabase/client";
import { tryWriteOne } from "@/utils/supabase/writeOne";

import type {
  EntityFacets,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { scopeCountsFromRows } from "@/lib/entity-list/types";
import type { EntityListPage } from "@/lib/entity-list/types";
import { listOrgParam } from "@/lib/list-scope/types";
import type { TranscriptListRow, TranscriptRowEdit } from "./types";

/** The list's filters plus the archive axis, as `trx_list_scoped` / `trx_list_scope_counts` read them. */
export function transcriptFilters(query: EntityListQuery): Record<string, unknown> {
  return { ...query.filters, archived: { value: query.archived } };
}

function sortFacets(facets: EntityFacets): EntityFacets {
  for (const values of Object.values(facets.byKind)) {
    values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return facets;
}

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

export async function fetchTranscriptListPage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<TranscriptListRow>> {
  const { data, error } = await supabase.rpc("trx_list_scoped", {
    p_scope: query.scope.kind,
    p_org_id: listOrgParam(query),
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_sort: sort.sort,
    p_dir: sort.direction,
    p_filters: transcriptFilters(query),
    p_limit: sort.pageSize,
    p_offset: (query.page - 1) * sort.pageSize,
  });

  if (error) throw pgError(error);

  const rows = (data ?? []) as TranscriptListRow[];
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

export async function fetchTranscriptScopeCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const { data, error } = await supabase.rpc("trx_list_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_org_id: listOrgParam(query),
    p_deep: query.deep,
    p_filters: transcriptFilters(query),
  });

  if (error) throw pgError(error);

  const counts = scopeCountsFromRows(data ?? [], "Unnamed");
  return counts;
}

export async function fetchTranscriptFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await supabase.rpc("trx_list_facets", {
    p_scope: query.scope.kind,
    p_org_id: listOrgParam(query),
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
  return sortFacets({ byKind });
}

/**
 * Persist an inline title edit, routed to the row's source table by kind.
 * Unsorted recordings have no user-facing title — the column's `editableIf`
 * hides the pencil for them; this throw is the backstop if a write arrives
 * anyway.
 */
export async function saveTranscriptRowEdit(
  row: TranscriptListRow,
  edit: TranscriptRowEdit,
): Promise<void> {
  if (edit.title === undefined) return;
  const title = edit.title.trim();
  // Throw, don't silently skip: the shell only patches the local row and
  // toasts success AFTER save resolves, so a swallowed blank would show an
  // empty title that never persisted.
  if (!title) throw new Error("Title cannot be empty.");

  if (row.kind === "transcript") {
    const { error } = await tryWriteOne(
      supabase
        .schema("transcripts")
        .from("transcripts")
        .update({ title })
        .eq("id", row.id)
        .select("id"),
      { action: "rename", noun: "transcript" },
    );
    if (error) throw pgError(error);
    return;
  }
  if (row.kind === "session" || row.kind === "cleanup") {
    const { error } = await tryWriteOne(
      supabase
        .schema("transcripts")
        .from("studio_sessions")
        .update({ title })
        .eq("id", row.id)
        .select("id"),
      { action: "rename", noun: "session" },
    );
    if (error) throw pgError(error);
    return;
  }
  throw new Error(`Rows of kind "${row.kind}" cannot be renamed.`);
}
