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
// auth.uid()); there is no Next.js middle tier. Table: rag.kg_suggestion_ack.

import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

function requireCurrentUser(expectedUserId: string): void {
  if (requireUserId() !== expectedUserId) {
    throw new Error("Suggestion acknowledgements belong to the signed-in user.");
  }
}

/** Every suggestion id this user has permanently dismissed. */
export async function fetchAckedSuggestionIds(
  userId: string,
): Promise<Set<string>> {
  requireCurrentUser(userId);
  const { data, error } = await supabase
    .schema("rag").from("kg_suggestion_ack")
    .select("suggestion_id")
    .is("deleted_at", null)
    .eq("created_by", userId);
  if (error) throw operationFailed("load your dismissed suggestions", error);
  return new Set((data ?? []).map((r) => r.suggestion_id));
}

/**
 * Dismiss a batch of suggestion ids while their acknowledgement is live.
 *
 * `kg_suggestion_ack_created_by_suggestion_key` is deliberately partial:
 * a deleted acknowledgement is not a current dismissal. PostgreSQL cannot infer
 * that partial predicate from an `onConflict` column list, so insert each row and
 * treat only the live-row uniqueness race as the idempotent success case.
 */
export async function ackSuggestions(
  userId: string,
  suggestionIds: string[],
): Promise<void> {
  requireCurrentUser(userId);
  if (suggestionIds.length === 0) return;
  // A dismissal is filed in the organization the person has selected (asked
  // when none is). RLS scopes every row to auth.uid(), and the read side keys
  // on (created_by, suggestion_id), so the dismissal holds across organizations.
  const organizationId = await ensureOrgId(null);
  for (const suggestion_id of suggestionIds) {
    const row = {
    created_by: userId,
    suggestion_id,
    organization_id: organizationId,
    };
    const { error } = await supabase.schema("rag").from("kg_suggestion_ack").insert(row);
    // A concurrent/repeated live dismissal is already the desired state. Do not
    // swallow any other write failure: it may mean RLS, connectivity, or schema drift.
    if (error && error.code !== "23505") throw operationFailed("dismiss these suggestions", error);
  }
}
