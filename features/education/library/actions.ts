// features/education/library/actions.ts
//
// Server actions for the community library's WRITE paths. Certification is a
// super-admin editorial grant (re-checked here + gated again in the RPC + DB).
// Suggest-edit / resolve run under the caller's session (the RPCs enforce
// author/owner rules). All throw on error so the client surfaces it.

"use server";

import { createClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { operationFailed } from "@/utils/errors";
import type { DeckSuggestionRow } from "./types";

// ─── Certified tier (super-admin) ─────────────────────────────────────────────
export async function certifyDeckAction(
  resourceId: string,
  note?: string,
): Promise<void> {
  await requireSuperAdmin();
  const sb = await createClient();
  const { error } = await sb.rpc("edu_certify_content", {
    p_resource_type: "fc_set",
    p_resource_id: resourceId,
    p_note: note ?? undefined,
  });
  if (error) throw operationFailed("certify this deck", error);
}

export async function uncertifyDeckAction(resourceId: string): Promise<void> {
  await requireSuperAdmin();
  const sb = await createClient();
  const { error } = await sb.rpc("edu_uncertify_content", {
    p_resource_type: "fc_set",
    p_resource_id: resourceId,
  });
  if (error) throw operationFailed("remove this deck's certification", error);
}

// ─── Suggest-edit flywheel (any authenticated user → the deck owner) ──────────
export async function suggestEditAction(
  resourceId: string,
  body: string,
): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.rpc("edu_suggest_edit", {
    p_resource_id: resourceId,
    p_body: body,
    p_resource_type: "fc_set",
  });
  if (error) throw operationFailed("send your suggestion", error);
}

/** Suggestions on the caller's own decks (the owner inbox). */
export async function listOwnerSuggestionsAction(): Promise<DeckSuggestionRow[]> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await sb
    .schema("education")
    .from("deck_suggestion")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw operationFailed("load suggestions on your decks", error);
  return (data ?? []) as DeckSuggestionRow[];
}

export async function resolveSuggestionAction(
  id: string,
  status: "accepted" | "declined" | "open",
): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.rpc("edu_resolve_suggestion", {
    p_id: id,
    p_status: status,
  });
  if (error) throw operationFailed("update this suggestion", error);
}
