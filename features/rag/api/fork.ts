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

export async function forkProcessedDocument(sourceId: string): Promise<string> {
  const { data, error } = await supabase.rpc("fork_processed_document", {
    p_source_id: sourceId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("fork returned no document id");
  return data as string;
}
