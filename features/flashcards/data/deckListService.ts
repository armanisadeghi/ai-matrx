// features/flashcards/data/deckListService.ts
//
// The deck library's server-side list reads — `education.fc_set_list_scoped`,
// `fc_set_list_counts` and `fc_set_list_facets` (hand-written from the
// template in lib/list-scope/FEATURE.md). Lane, archive axis, search, column
// filters, sort, paging, counts and facet options all run on the server, so
// the Flashcards home never loads the whole library into the browser.
//
// SECURITY INVOKER RPCs: the table's RLS is the ceiling; each call declares
// its lane (THE VIEW LAW).

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";

const EDU = () => supabase.schema("education");

export type DeckLane = "mine" | "orgs" | "shared" | "public";
export type DeckArchive = "active" | "archived" | "all";

/** One row of the library as the list RPC returns it. */
export interface DeckListRow {
  id: string;
  organization_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  visibility: string;
  name: string;
  description: string | null;
  topic: string | null;
  lesson: string | null;
  difficulty: string | null;
  folder_ids: string[];
}

export interface DeckListQuery {
  lane: DeckLane;
  orgId?: string | null;
  search: string;
  filters: Record<string, unknown>;
  archived: DeckArchive;
}

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(
    `Your flashcard decks could not be ${what}: ${error?.message ?? "unknown error"}`,
  );
}

export async function fetchDeckPage(
  query: DeckListQuery,
  sort: { sort: string; ascending: boolean; limit: number; offset: number },
): Promise<{ rows: DeckListRow[]; total: number }> {
  const { data, error } = await EDU().rpc("fc_set_list_scoped", {
    p_scope: query.lane,
    p_org_id: query.orgId ?? undefined,
    p_search: query.search,
    p_filters: query.filters as Json,
    p_archived: query.archived,
    p_sort: sort.sort,
    p_ascending: sort.ascending,
    p_limit: sort.limit,
    p_offset: sort.offset,
  });
  if (error) fail("listed", error);
  const rows = (data ?? []) as (DeckListRow & { total_count: number })[];
  return {
    rows: rows.map(({ total_count: _total, ...row }) => ({
      ...row,
      folder_ids: row.folder_ids ?? [],
    })),
    total: rows[0]?.total_count ?? 0,
  };
}

export async function fetchDeckLaneCounts(
  query: Omit<DeckListQuery, "lane" | "orgId">,
): Promise<Record<DeckLane, number>> {
  const { data, error } = await EDU().rpc("fc_set_list_counts", {
    p_search: query.search,
    p_filters: query.filters as Json,
    p_archived: query.archived,
  });
  if (error) fail("counted", error);
  const out: Record<DeckLane, number> = { mine: 0, orgs: 0, shared: 0, public: 0 };
  for (const row of (data ?? []) as { scope: string; total: number }[]) {
    if (row.scope in out) out[row.scope as DeckLane] = Number(row.total);
  }
  return out;
}

export async function fetchDeckFacets(
  query: DeckListQuery,
): Promise<Record<string, { value: string; count: number }[]>> {
  const { data, error } = await EDU().rpc("fc_set_list_facets", {
    p_scope: query.lane,
    p_org_id: query.orgId ?? undefined,
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
 * The person's own decks an agent write names — by id, or (for create's
 * duplicate check) by name — read narrowly, never the whole library.
 */
export async function fetchOwnDecksFor(input: {
  userId: string;
  ids: string[];
  names: string[];
}): Promise<{ id: string; name: string; archived: boolean }[]> {
  const out = new Map<string, { id: string; name: string; archived: boolean }>();
  const add = (rows: { id: string; name: string; deleted_at: string | null }[] | null) => {
    for (const r of rows ?? [])
      out.set(r.id, { id: r.id, name: r.name, archived: r.deleted_at !== null });
  };
  const ids = input.ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length > 0) {
    const { data, error } = await EDU()
      .from("fc_set")
      .select("id, name, deleted_at")
      .eq("created_by", input.userId)
      .in("id", ids);
    if (error) fail("read", error);
    add(data);
  }
  for (const name of input.names.filter((n) => n.trim())) {
    const { data, error } = await EDU()
      .from("fc_set")
      .select("id, name, deleted_at")
      .eq("created_by", input.userId)
      .is("deleted_at", null)
      .ilike("name", name.trim().replace(/[\\%_]/g, (c) => `\\${c}`));
    if (error) fail("read", error);
    add(data);
  }
  return [...out.values()];
}
