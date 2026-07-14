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

/**
 * The CERTIFIED public decks curated for one exam (`fc_set.metadata.exam_slug`),
 * for the exam-prep hub's curated-library block. Reuses the SAME anon-safe
 * `edu_public_decks` RPC (visibility='public' only) with its exam-slug +
 * certified-only filters — no bespoke query. Anon/cookie-free so the exam pages
 * stay statically generable (ISR). Never throws; returns [] + logs on error.
 */
export async function fetchExamCertifiedDecks(
  examSlug: string,
  limit = 12,
): Promise<PublicDeck[]> {
  const sb = getScriptSupabaseClient();
  const { data, error } = await sb.rpc("edu_public_decks", {
    p_certified_only: true,
    p_exam_slug: examSlug,
    p_limit: limit,
  });
  if (error) {
    console.error(
      `[library] fetchExamCertifiedDecks(${examSlug}) failed:`,
      error.message,
    );
    return [];
  }
  return ((data ?? []) as PublicDeckRow[]).map(mapPublicDeck);
}
