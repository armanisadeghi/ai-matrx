// features/ai-work/conversations/service.ts
//
// Direct browser → Supabase for the /work/conversations table. No Next.js hop,
// no Python hop: a plain DB read the browser is entitled to make
// (CLAUDE.md § Data flow).
//
// Three calls, mirroring features/agents/browse/service.ts against the
// conversation RPC family (migrations/cvx_list_scoped.sql):
//   fetchConversationPage        — one page of rows + the TRUE total
//   fetchConversationScopeCounts — every scope tab's true total
//   fetchConversationFacets      — filter OPTIONS with counts per finite column
//
// Favorites are the ONE write this surface makes, and it goes through the
// canonical favorites service rather than a second UPDATE against
// chat.conversation.

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { scopeOrgId } from "@/lib/list-scope/types";
import type { ConversationBrowseRow } from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

function filtersJson(query: EntityListQuery): Json {
  return query.filters as unknown as Json;
}

export async function fetchConversationPage(
  query: EntityListQuery,
  opts: EntityListSort,
): Promise<EntityListPage<ConversationBrowseRow>> {
  const { data, error } = await supabase.rpc("cvx_list_scoped", {
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

  const rows = (data ?? []) as ConversationBrowseRow[];
  // total_count is a window function over the filtered set — identical on every
  // row. Zero rows legitimately means zero matches, not "unknown".
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

export async function fetchConversationScopeCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const { data, error } = await supabase.rpc("cvx_list_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_deep: query.deep,
    p_archived: query.archived,
    p_filters: filtersJson(query),
  });

  if (error) throw pgError(error);

  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  for (const row of data ?? []) {
    const kind = row.scope;
    if (kind !== "mine" && kind !== "orgs" && kind !== "shared") continue;
    const total = Number(row.total ?? 0);
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
 * Filter options with counts for the current scope + search, deliberately NOT
 * narrowed by the column selection itself.
 *
 * This is also what makes the default machine-run exclusion honest: the
 * `conversation_type` facet always reports the true `subagent` total, so the
 * door to the excluded rows carries its own number rather than asking the user
 * to trust that something is there.
 */
export async function fetchConversationFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await supabase.rpc("cvx_list_facets", {
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
  for (const values of Object.values(byKind)) {
    values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return { byKind };
}

/** Inline title edit. One UPDATE on a row the user can see, RLS-authorized. */
export async function saveConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .schema("chat")
    .from("conversation")
    .update({ title: title.trim() || null })
    .eq("id", conversationId);
  if (error) throw pgError(error);
}
