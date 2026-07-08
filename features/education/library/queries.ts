// features/education/library/queries.ts
//
// Server read for the community library's initial (SSR) deck list — anon,
// cookie-free client so it renders for signed-out visitors and is SEO-visible.
// The client browser re-queries via service.ts as the user searches/filters.

import "server-only";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { mapPublicDeck, type PublicDeck, type PublicDeckRow } from "./types";

export async function fetchInitialPublicDecks(limit = 60): Promise<PublicDeck[]> {
  const sb = getScriptSupabaseClient();
  const { data, error } = await sb.rpc("edu_public_decks", {
    p_search: undefined,
    p_certified_only: false,
    p_limit: limit,
  });
  if (error) {
    // Loud, but don't 500 the whole library on a listing hiccup — the client
    // re-query will retry. Log so it's visible.
    console.error("[library] fetchInitialPublicDecks failed:", error.message);
    return [];
  }
  return ((data ?? []) as PublicDeckRow[]).map(mapPublicDeck);
}
