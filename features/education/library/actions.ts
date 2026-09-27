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

import { getClaimsUser } from "@/utils/supabase/claimsUser";
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

// ─── Suggest-edit flywheel ────────────────────────────────────────────────────
// Sending and answering suggestions are direct client RPCs (service.ts
// `suggestDeckEdit` / `resolveDeckSuggestion`): a server action's error is
// redacted in production, which hid the RPC's reason from the person.

/** Suggestions on the caller's own decks (the owner inbox). */
export async function listOwnerSuggestionsAction(): Promise<DeckSuggestionRow[]> {
  const sb = await createClient();
  const {
    data: { user },
    error: authError,
  } = await getClaimsUser(sb);
  // SIGNED OUT is an answer; a verification failure is not. Only the first
  // deserves "not authenticated".
  if (authError)
    throw operationFailed("verify your sign-in", authError);
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
