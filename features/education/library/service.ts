// features/education/library/service.ts
//
// Client-side reads for the community library. The public-deck listing is a
// direct RPC (RLS/definer-gated to visibility='public' only) — the canonical
// direct UI↔DB path, no Python hop. Never throws; returns [] + logs on error
// (the browser surfaces an empty state).

"use client";

import { supabase } from "@/utils/supabase/client";

import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import {
  mapPublicDeck,
  type EducationLibraryRow,
  type PublicDeck,
  type PublicDeckRow,
} from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "The Education Library could not be loaded.",
  );
}

export async function fetchEducationLibraryPage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<EducationLibraryRow>> {
  const { data, error } = await supabase.rpc("edu_library_list_scoped", {
    p_scope: query.scope.kind,
    p_search: query.search.trim() || undefined,
    p_sort: sort.sort,
    p_dir: sort.direction,
    p_filters: query.filters,
    p_limit: sort.pageSize,
    p_offset: (query.page - 1) * sort.pageSize,
  });
  if (error) throw pgError(error);
  const rows = data ?? [];
  return { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
}

export async function fetchEducationLibraryCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const { data, error } = await supabase.rpc("edu_library_scope_counts", {
    p_search: query.search.trim() || undefined,
    p_filters: query.filters,
  });
  if (error) throw pgError(error);
  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  for (const row of data ?? []) {
    if (
      row.scope === "mine" ||
      row.scope === "shared" ||
      row.scope === "public"
    ) {
      counts.byKind[row.scope] = Number(row.total ?? 0);
    }
  }
  return counts;
}

export async function fetchEducationLibraryFacets(
  query: EntityListQuery,
): Promise<EntityFacets> {
  const { data, error } = await supabase.rpc("edu_library_facets", {
    p_scope: query.scope.kind,
    p_search: query.search.trim() || undefined,
  });
  if (error) throw pgError(error);
  const byKind: EntityFacets["byKind"] = {};
  for (const row of data ?? []) {
    (byKind[row.kind] ??= []).push({
      value: row.value,
      count: Number(row.total ?? 0),
    });
  }
  return { byKind };
}

export interface ListPublicDecksArgs {
  search?: string;
  certifiedOnly?: boolean;
  limit?: number;
}

export async function listPublicDecks({
  search,
  certifiedOnly,
  limit,
}: ListPublicDecksArgs = {}): Promise<PublicDeck[]> {
  const { data, error } = await supabase.rpc("edu_public_decks", {
    p_search: search ?? undefined,
    p_certified_only: certifiedOnly ?? false,
    p_limit: limit ?? 60,
  });
  // A failed read THROWS: `[]` read as "No public decks match yet" (RC-B12).
  if (error) throw new Error(`Couldn't load the community decks: ${error.message}`);
  return ((data ?? []) as PublicDeckRow[]).map(mapPublicDeck);
}

// ─── Suggest-edit flywheel — direct RPCs (the RPCs enforce author/owner) ──────
//
// These were server actions until 2026-09-27. A server action's error message
// is REDACTED in production builds ("React error #441"), so a person — and an
// agent on the page — saw "internal error" instead of the RPC's own reason
// ("cannot suggest an edit to your own deck"). Direct React → Supabase is the
// canonical path anyway (CLAUDE.md, data flow).

/** Send a suggestion to a community deck's owner. Throws the RPC's reason. */
export async function suggestDeckEdit(
  resourceId: string,
  body: string,
): Promise<void> {
  const { error } = await supabase.rpc("edu_suggest_edit", {
    p_resource_id: resourceId,
    p_body: body,
    p_resource_type: "fc_set",
  });
  if (error) throw pgError(error);
}

/** Accept / decline (or reopen) a suggestion on one of the caller's decks. */
export async function resolveDeckSuggestion(
  id: string,
  status: "accepted" | "declined" | "open",
): Promise<void> {
  const { error } = await supabase.rpc("edu_resolve_suggestion", {
    p_id: id,
    p_status: status,
  });
  if (error) throw pgError(error);
}
