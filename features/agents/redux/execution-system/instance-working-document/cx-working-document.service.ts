/**
 * cx-working-document.service — Supabase CRUD for `public.cx_working_documents`.
 *
 * The chat-conversation analog of Scribe's `studio_documents` service. Gives the
 * per-conversation working document a DURABLE backing row so the agent's
 * server-side `ctx_patch` edits persist and round-trip back via realtime.
 *
 * snake_case (DB) ↔ camelCase (domain) mapping happens here so callers never see
 * DB casing. One row per conversation (UNIQUE conversation_id); access scoped to
 * the owner via RLS (`user_id = auth.uid()`).
 */

import { supabase } from "@/utils/supabase/client";

export interface CxWorkingDocumentRow {
  id: string;
  conversation_id: string;
  user_id: string;
  title: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CxWorkingDocument {
  id: string;
  conversationId: string;
  userId: string;
  title: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function rowToCxWorkingDocument(
  row: CxWorkingDocumentRow,
): CxWorkingDocument {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch the conversation's working document, or null if none exists yet.
 */
export async function getCxWorkingDocument(
  conversationId: string,
): Promise<CxWorkingDocument | null> {
  const { data, error } = await supabase
    .from("cx_working_documents")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) {
    throw new Error(`[cx-working-document] get failed: ${error.message}`);
  }
  return data ? rowToCxWorkingDocument(data as CxWorkingDocumentRow) : null;
}

/**
 * Get the conversation's working document, creating it on first access. Relies
 * on the UNIQUE (conversation_id) constraint so a concurrent create resolves to
 * a single row (we re-select on conflict). `user_id` defaults to `auth.uid()`
 * at the DB so the insert is owner-scoped without the client passing it.
 */
export async function getOrCreateCxWorkingDocument(
  conversationId: string,
  title = "Working document",
): Promise<CxWorkingDocument> {
  const existing = await getCxWorkingDocument(conversationId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("cx_working_documents")
    .insert({ conversation_id: conversationId, title })
    .select("*")
    .single();
  if (error) {
    // A concurrent insert won the race — re-read the now-existing row.
    const retry = await getCxWorkingDocument(conversationId);
    if (retry) return retry;
    throw new Error(
      `[cx-working-document] getOrCreate insert failed: ${error.message}`,
    );
  }
  return rowToCxWorkingDocument(data as CxWorkingDocumentRow);
}

/**
 * Direct content write (used by inline user edits on the client). The agent's
 * own edits land server-side via the ctx_patch writeback handler and arrive
 * back through realtime — they do NOT go through this path.
 */
export async function updateCxWorkingDocumentContent(
  id: string,
  content: string,
): Promise<CxWorkingDocument> {
  const { data, error } = await supabase
    .from("cx_working_documents")
    .update({ content })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[cx-working-document] update failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToCxWorkingDocument(data as CxWorkingDocumentRow);
}
