// features/education/library/service.ts
//
// Client-side reads for the community library. The public-deck listing is a
// direct RPC (RLS/definer-gated to visibility='public' only) — the canonical
// direct UI↔DB path, no Python hop. Never throws; returns [] + logs on error
// (the browser surfaces an empty state).

"use client";

import { supabase } from "@/utils/supabase/client";
import { mapPublicDeck, type PublicDeck, type PublicDeckRow } from "./types";

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
  if (error) {
    console.error("[library] listPublicDecks failed:", error.message);
    return [];
  }
  return ((data ?? []) as PublicDeckRow[]).map(mapPublicDeck);
}
