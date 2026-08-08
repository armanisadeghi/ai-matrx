// features/transcripts/browse/service.ts
//
// Direct browser → Supabase (CLAUDE.md § Data flow). The entity-list service
// triple over the trx_* RPC set, replacing the four hub queries + two
// enrichment calls in the retired transcriptsHubService.
//
// Transcripts has no favorite/archived axes, so those pieces of the generic
// query are inert here: favoritesFirst is ignored and `archived` never leaves
// its default (the config sets supportsArchived: false).

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type {
  EntityFacets,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { EntityListPage } from "@/lib/entity-list/types";
import { scopeOrgId } from "@/lib/list-scope/types";
import type { TranscriptListRow, TranscriptRowEdit } from "./types";

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
    p_org_id: scopeOrgId(query.scope) ?? undefined,
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_sort: sort.sort,
    p_dir: sort.direction,
    p_filters: query.filters as unknown as Json,
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
    p_deep: query.deep,
    p_filters: query.filters as unknown as Json,
  });

  if (error) throw pgError(error);

  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  for (const row of data ?? []) {
    const total = Number(row.total ?? 0);
    const kind = row.scope;
    if (kind !== "mine" && kind !== "orgs" && kind !== "shared" && kind !== "public") {
      continue;
    }
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

export async function fetchTranscriptFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await supabase.rpc("trx_list_facets", {
    p_scope: query.scope.kind,
    p_org_id: scopeOrgId(query.scope) ?? undefined,
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
  for (const values of Object.values(byKind)) {
    values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return { byKind };
}

/**
 * Persist an inline title edit, routed to the row's source table by kind.
 * Unsorted recordings have no user-facing title — the column is not editable
 * for them (enforced here as well, loudly).
 */
export async function saveTranscriptRowEdit(
  row: TranscriptListRow,
  edit: TranscriptRowEdit,
): Promise<void> {
  if (edit.title === undefined) return;
  const title = edit.title.trim();
  if (!title) return;

  if (row.kind === "transcript") {
    const { error } = await supabase
      .schema("transcripts")
      .from("transcripts")
      .update({ title })
      .eq("id", row.id);
    if (error) throw pgError(error);
    return;
  }
  if (row.kind === "session" || row.kind === "cleanup") {
    const { error } = await supabase
      .schema("transcripts")
      .from("studio_sessions")
      .update({ title })
      .eq("id", row.id);
    if (error) throw pgError(error);
    return;
  }
  throw new Error(`Rows of kind "${row.kind}" cannot be renamed.`);
}
