/**
 * cx-working-document.service — Supabase CRUD for `public.cx_working_documents`
 * (the document entity) and `public.cx_conversation_documents` (the junction).
 *
 * The chat-conversation analog of Scribe's `studio_documents`. Gives each
 * per-conversation document a DURABLE backing row so the agent's server-side
 * `ctx_patch` edits persist and round-trip back via realtime.
 *
 * TWO KINDS, ONE SHAPE:
 *   - "working" — the collaborative doc the agent reads AND writes.
 *   - "scratch" — the user's private scratchpad; the agent reads it but never
 *     writes it (read-only contract enforced at the context-value layer).
 *
 * THE JUNCTION (`cx_conversation_documents`) is what makes opt-in PERSIST and
 * cross-conversation LINKING possible: it is the durable per-(conversation,
 * kind) pointer at a document plus the `enabled` flag. `cx_working_documents`
 * is the document; its `conversation_id` is now origin/provenance, not
 * identity. Many conversations can point at one `document_id`.
 *
 * snake_case (DB) ↔ camelCase (domain) mapping happens here so callers never
 * see DB casing. Access is owner-scoped (`user_id = auth.uid()`) via RLS.
 */

import { supabase } from "@/utils/supabase/client";

export type WorkingDocumentKind = "working" | "scratch";

export interface CxWorkingDocumentRow {
  id: string;
  conversation_id: string | null;
  user_id: string;
  kind: string;
  title: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CxWorkingDocument {
  id: string;
  conversationId: string | null;
  userId: string;
  kind: WorkingDocumentKind;
  title: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface CxConversationDocumentRow {
  id: string;
  conversation_id: string;
  kind: string;
  document_id: string;
  user_id: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CxConversationDocumentLink {
  id: string;
  conversationId: string;
  kind: WorkingDocumentKind;
  documentId: string;
  userId: string;
  enabled: boolean;
}

export function rowToCxWorkingDocument(
  row: CxWorkingDocumentRow,
): CxWorkingDocument {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    kind: (row.kind as WorkingDocumentKind) ?? "working",
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToLink(row: CxConversationDocumentRow): CxConversationDocumentLink {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    kind: (row.kind as WorkingDocumentKind) ?? "working",
    documentId: row.document_id,
    userId: row.user_id,
    enabled: row.enabled,
  };
}

// =============================================================================
// Document CRUD (by document id)
// =============================================================================

/**
 * Fetch a single working document by its own id (the durable document entity).
 * Used by the realtime/writeback resync path, which keys on the bound document
 * id — NOT the conversation id, so linked conversations resolve correctly.
 */
export async function getCxWorkingDocumentById(
  documentId: string,
): Promise<CxWorkingDocument | null> {
  const { data, error } = await supabase
    .schema("chat").from("working_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (error) {
    throw new Error(`[cx-working-document] get by id failed: ${error.message}`);
  }
  return data ? rowToCxWorkingDocument(data as CxWorkingDocumentRow) : null;
}

/**
 * Persist the user-chosen title for a document row.
 */
export async function updateCxWorkingDocumentTitle(
  id: string,
  title: string,
): Promise<CxWorkingDocument> {
  const { data, error } = await supabase
    .schema("chat").from("working_documents")
    .update({ title })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[cx-working-document] title update failed: ${error?.message ?? "no row"}`,
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
    .schema("chat").from("working_documents")
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

/**
 * List the current user's documents of a given kind, newest-edited first.
 * Powers the "link an existing document" picker (cross-conversation linking).
 */
export async function listUserDocuments(
  kind: WorkingDocumentKind,
  limit = 50,
): Promise<CxWorkingDocument[]> {
  const { data, error } = await supabase
    .schema("chat").from("working_documents")
    .select("*")
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`[cx-working-document] list failed: ${error.message}`);
  }
  return (data as CxWorkingDocumentRow[]).map(rowToCxWorkingDocument);
}

/** Lightweight rail row — enough to list + preview a document without its full body. */
export interface CxWorkingDocumentSummary {
  id: string;
  conversationId: string | null;
  kind: WorkingDocumentKind;
  title: string;
  /** First ~200 chars of the body, for the rail preview. */
  preview: string;
  updatedAt: string;
}

/**
 * List the current user's recent documents across BOTH kinds, newest-edited
 * first — the data behind the DocumentsWorkspace rail. Returns a lightweight
 * summary (id, kind, title, a short preview, updatedAt); the full body loads
 * only when a document is opened. RLS scopes to the owner.
 */
export async function listRecentUserDocuments(
  limit = 100,
): Promise<CxWorkingDocumentSummary[]> {
  const { data, error } = await supabase
    .schema("chat").from("working_documents")
    .select("id, conversation_id, kind, title, content, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`[cx-working-document] list recent failed: ${error.message}`);
  }
  return (
    data as Array<
      Pick<
        CxWorkingDocumentRow,
        "id" | "conversation_id" | "kind" | "title" | "content" | "updated_at"
      >
    >
  ).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    kind: (row.kind as WorkingDocumentKind) ?? "working",
    title: row.title,
    preview: (row.content ?? "").trim().slice(0, 200),
    updatedAt: row.updated_at,
  }));
}

// =============================================================================
// Junction (cx_conversation_documents) — the per-(conversation, kind) pointer
// =============================================================================

/**
 * Read the conversation's link for a kind, or null if none exists yet.
 * READ-ONLY — never creates. Used by hydrate to restore persisted opt-in/link
 * on mount without provisioning anything.
 */
export async function getConversationDocumentLink(
  conversationId: string,
  kind: WorkingDocumentKind,
): Promise<CxConversationDocumentLink | null> {
  const { data, error } = await supabase
    .schema("chat").from("conversation_documents")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) {
    throw new Error(
      `[cx-conversation-document] get link failed: ${error.message}`,
    );
  }
  return data ? rowToLink(data as CxConversationDocumentRow) : null;
}

/**
 * The conversation's resolved document for a kind: the document row plus its
 * junction link.
 */
export interface ResolvedConversationDocument {
  document: CxWorkingDocument;
  link: CxConversationDocumentLink;
}

/**
 * Ensure the conversation has a document of `kind` and a junction link to it,
 * creating both on first access (the Scribe pattern, generalised + persisted).
 * Sets the link `enabled = true` since this is the provision-on-enable path.
 *
 * Idempotent: an existing link is reused (its document loaded by id). A
 * concurrent create resolves via the UNIQUE (conversation_id, kind) constraint
 * (we re-read on conflict).
 */
export async function getOrCreateConversationDocument(
  conversationId: string,
  kind: WorkingDocumentKind,
): Promise<ResolvedConversationDocument> {
  const existing = await getConversationDocumentLink(conversationId, kind);
  if (existing) {
    const doc = await getCxWorkingDocumentById(existing.documentId);
    if (doc) {
      // Re-enable on access through the provision path.
      if (!existing.enabled) {
        await setConversationDocumentEnabled(conversationId, kind, true);
        existing.enabled = true;
      }
      return { document: doc, link: existing };
    }
    // Link points at a vanished document (cascade gap) — fall through and
    // rebuild a fresh document for this conversation.
  }

  // Create a CANDIDATE document (origin = this conversation). Because the 1:1
  // UNIQUE on cx_working_documents is gone (sharing), concurrent provisioning
  // could create two docs — so we claim the junction (which DOES carry
  // UNIQUE(conversation_id, kind)) as the race arbiter and clean up the loser.
  const { data: docData, error: docError } = await supabase
    .schema("chat").from("working_documents")
    .insert({ conversation_id: conversationId, kind, title: "" })
    .select("*")
    .single();
  if (docError || !docData) {
    throw new Error(
      `[cx-working-document] create failed: ${docError?.message ?? "no row"}`,
    );
  }
  const candidate = rowToCxWorkingDocument(docData as CxWorkingDocumentRow);

  // Claim the junction. A unique violation here means a concurrent claim won;
  // that is expected and non-fatal — we resolve it via the authoritative
  // re-read below.
  await supabase.schema("chat").from("conversation_documents").insert({
    conversation_id: conversationId,
    kind,
    document_id: candidate.id,
    enabled: true,
  });

  const winner = await getConversationDocumentLink(conversationId, kind);
  if (!winner) {
    // No winning row materialised (extremely unlikely) — force-claim with the
    // candidate so the caller always gets a consistent link.
    const link = await upsertConversationDocumentLink(
      conversationId,
      kind,
      candidate.id,
      true,
    );
    return { document: candidate, link };
  }

  if (winner.documentId !== candidate.id) {
    // We lost the race — delete the orphan candidate and adopt the winner.
    await supabase.schema("chat").from("working_documents").delete().eq("id", candidate.id);
    const doc = await getCxWorkingDocumentById(winner.documentId);
    return { document: doc ?? candidate, link: winner };
  }

  if (!winner.enabled) {
    await setConversationDocumentEnabled(conversationId, kind, true);
    winner.enabled = true;
  }
  return { document: candidate, link: winner };
}

/**
 * Upsert the (conversation, kind) → document_id link with an `enabled` flag.
 * The single junction-write chokepoint. Used by enable/disable and linking.
 */
async function upsertConversationDocumentLink(
  conversationId: string,
  kind: WorkingDocumentKind,
  documentId: string,
  enabled: boolean,
): Promise<CxConversationDocumentLink> {
  const { data, error } = await supabase
    .schema("chat").from("conversation_documents")
    .upsert(
      {
        conversation_id: conversationId,
        kind,
        document_id: documentId,
        enabled,
      },
      { onConflict: "conversation_id,kind" },
    )
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[cx-conversation-document] upsert link failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToLink(data as CxConversationDocumentRow);
}

/**
 * Persist the opt-in flag for an EXISTING link. Enabling a doc that has no
 * link yet goes through `getOrCreateConversationDocument` instead; this is the
 * disable path (and the re-enable of an already-provisioned link). A no-op
 * when no link exists and `enabled` is false.
 */
export async function setConversationDocumentEnabled(
  conversationId: string,
  kind: WorkingDocumentKind,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .schema("chat").from("conversation_documents")
    .update({ enabled })
    .eq("conversation_id", conversationId)
    .eq("kind", kind);
  if (error) {
    throw new Error(
      `[cx-conversation-document] set enabled failed: ${error.message}`,
    );
  }
}

/**
 * Point this conversation's (kind) link at an EXISTING document — the
 * cross-conversation link. Enables it. Returns the linked document.
 */
export async function linkConversationToDocument(
  conversationId: string,
  kind: WorkingDocumentKind,
  documentId: string,
): Promise<ResolvedConversationDocument> {
  const document = await getCxWorkingDocumentById(documentId);
  if (!document) {
    throw new Error(
      `[cx-conversation-document] cannot link to missing document ${documentId}`,
    );
  }
  const link = await upsertConversationDocumentLink(
    conversationId,
    kind,
    documentId,
    true,
  );
  return { document, link };
}
