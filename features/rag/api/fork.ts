/**
 * features/rag/api/fork.ts
 *
 * Fork a (shared / library) processed_document into a user-owned copy.
 *
 * Data op → Supabase directly (no Next.js middle tier). Backed by the
 * SECURITY DEFINER RPC public.fork_processed_document (migration 0126): it is
 * needed because a library CONSUMER can read the source only via the
 * data_store grant — base RLS does not make the source's pages readable, so
 * the copy must happen server-side under the definer.
 *
 * Get-or-create: re-forking the same source returns the SAME fork (one fork
 * per user per source). Returns the new processed_document id, which the caller
 * opens in the PDF Extractor Studio (`/tools/pdf-extractor/{id}`) — the user
 * owns the fork outright and can run their own agents / segmentation on it
 * while our base stays read-only.
 */

import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

export async function forkProcessedDocument(
  sourceId: string,
  organizationId?: string | null,
): Promise<string> {
  // WHICH ORGANIZATION THE COPY LANDS IN IS A QUESTION ONLY THE PERSON CAN ANSWER.
  // The source's organization is where the ORIGINAL lives (usually the library), and the
  // RPC used to answer it with the caller's personal workspace — a workspace nobody
  // chose (DEFAULT-ORG-4, 2026-09-22). `ensureOrgId` returns the active organization, or
  // opens the picker and returns what the person selects; it never substitutes one. It
  // throws `OrganizationSelectionCancelled` when they close it, which means "not now".
  const orgId = await ensureOrgId(organizationId);
  const { data, error } = await supabase.rpc("fork_processed_document", {
    p_source_id: sourceId,
    p_organization_id: orgId,
  });
  // The definer RPC refuses when the caller's grant doesn't reach the source.
  // The raw PostgREST text is captured by the client-wide proxy; the user gets
  // a sentence we wrote.
  if (error) {
    throw new Error(
      "We couldn't make your own copy of this document. You may not have access to it any more.",
    );
  }
  if (!data) {
    throw new Error(
      "We couldn't make your own copy of this document. Please try again.",
    );
  }
  return data as string;
}
