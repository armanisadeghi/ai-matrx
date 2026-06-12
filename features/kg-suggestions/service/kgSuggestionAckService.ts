// features/kg-suggestions/service/kgSuggestionAckService.ts
//
// Persistent, per-user "I've permanently dismissed this suggestion" store for
// the GLOBAL new-suggestion toast. This is the only durable acknowledgement in
// the suggestion system — the inline hints (chips/dots/banners) are silenced
// only for one load and return on refresh. Here, "Don't show again" writes a
// row per suggestion id so that suggestion never re-triggers the toast, while
// a brand-new suggestion id (never acknowledged) still pops.
//
// Reads/writes go React → Supabase directly (RLS scopes every row to
// auth.uid()); there is no Next.js middle tier. Table: public.kg_suggestion_ack.

import { supabase } from "@/utils/supabase/client";

/** Every suggestion id this user has permanently dismissed. */
export async function fetchAckedSuggestionIds(
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("kg_suggestion_ack")
    .select("suggestion_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.suggestion_id));
}

/** Permanently dismiss a batch of suggestion ids (idempotent upsert). */
export async function ackSuggestions(
  userId: string,
  suggestionIds: string[],
): Promise<void> {
  if (suggestionIds.length === 0) return;
  const rows = suggestionIds.map((suggestion_id) => ({
    user_id: userId,
    suggestion_id,
  }));
  const { error } = await supabase
    .from("kg_suggestion_ack")
    .upsert(rows, {
      onConflict: "user_id,suggestion_id",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(error.message);
}
