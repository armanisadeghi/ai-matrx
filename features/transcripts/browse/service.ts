// features/transcripts/browse/service.ts
//
// Direct browser → Supabase (CLAUDE.md § Data flow). The entity-list service
// triple over the trx_* RPC set, replacing the four hub queries + two
// enrichment calls in the retired transcriptsHubService.
//
// Transcripts has no favorite axis (favoritesFirst is ignored). THE ARCHIVED-
// ITEMS LAW's axis rides `p_filters.archived` (active | archived | all) — the
// list and its lane counts read the same rows; `trx_list_scoped` returns
// `is_archived` per row.

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

const FACET_NONE = "__none__";

/**
 * Facets from the rows themselves — the same grouping `trx_list_facets` does over
 * `trx_list_scoped` (no column filters), plus the `archived` facet. Used when the
 * archive axis is not "active": `trx_list_facets` reads only active rows and its
 * signature is pinned (the T-13 readers list names it by signature and only shrinks).
 */
export function transcriptFacetsFromRows(rows: TranscriptListRow[]): EntityFacets {
  const counts = new Map<string, Map<string, number>>();
  const add = (kind: string, value: string | null | undefined) => {
    const v = value ? value : FACET_NONE;
    const byValue = counts.get(kind) ?? new Map<string, number>();
    byValue.set(v, (byValue.get(v) ?? 0) + 1);
    counts.set(kind, byValue);
  };
  let drafts = 0;
  let archived = 0;
  for (const row of rows) {
    add("kind", row.kind);
    add("status", row.status);
    add("visibility", row.visibility);
    add("organization_name", row.organization_name);
    add("owner_email", row.owner_email);
    if (row.kind === "transcript") {
      add("folder_name", row.folder_name);
      if (!row.tags || row.tags.length === 0) add("tag", FACET_NONE);
      else for (const tag of row.tags) add("tag", tag);
    }
    if (row.is_draft) drafts += 1;
    if (row.is_archived) archived += 1;
  }
  const byKind: EntityFacets["byKind"] = {};
  for (const [kind, byValue] of counts) {
    byKind[kind] = [...byValue].map(([value, count]) => ({ value, count }));
  }
  byKind.draft = [{ value: "draft", count: drafts }];
  byKind.archived = [{ value: "archived", count: archived }];
  return sortFacets({ byKind });
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
  if (query.archived !== "active") {
    // The same base `trx_list_facets` groups: every row of the lane, org filter and search, no column filters.
    const { data, error } = await supabase.rpc("trx_list_scoped", {
      p_scope: query.scope.kind,
      p_org_id: listOrgParam(query),
      p_search: query.search.trim() || undefined,
      p_deep: query.deep,
      p_filters: { archived: { value: query.archived } },
      p_limit: 1_000_000,
      p_offset: 0,
    });
    if (error) throw pgError(error);
    return transcriptFacetsFromRows((data ?? []) as TranscriptListRow[]);
  }
  const { data, error } = await supabase.rpc("trx_list_facets", {
    p_scope: query.scope.kind,
    p_org_id: listOrgParam(query),
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
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
