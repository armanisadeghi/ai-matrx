/**
 * cx-working-document.service — Supabase access for `workbench.working_documents`
 * (the canonical working-document entity) + its M2M links to conversations via
 * `platform.associations`.
 *
 * The chat-conversation analog of Scribe's `studio_documents`, generalised to a
 * first-class, versioned, owner-scoped entity. A working document is a piece of
 * text collaboratively edited by the user AND the agent; it can be attached to
 * MANY conversations (and a conversation can hold MANY documents).
 *
 * MATERIALIZE-ON-WRITE (the load-bearing contract): a working document has NO
 * durable row until the first byte of content is written by either party. The
 * client reserves the row id up front (a UUID) and `materializeWorkingDocument`
 * creates the row + the conversation association on that first write — never on
 * mere activation. So an enabled-but-untouched document leaves zero records.
 *
 * RELATIONSHIPS: chat↔doc links are `platform.associations` edges
 * (`working_document` source → `conversation` target), reached ONLY through the
 * canonical `associationsService`. The per-link opt-in flag + the doc kind live
 * on the edge `metadata` (`{enabled, doc_kind}`). The bespoke
 * `cx_conversation_documents` junction is retired.
 *
 * snake_case (DB) ↔ camelCase (domain) mapping happens here. Access is
 * owner-scoped (`created_by = auth.uid()`) via the entity-variant RLS.
 */

import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { Json } from "@/types/database.types";

export type WorkingDocumentKind = "working" | "scratch";

export interface CxWorkingDocumentRow {
  id: string;
  conversation_id: string | null;
  user_id: string | null;
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
  userId: string | null;
  kind: WorkingDocumentKind;
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
    kind: (row.kind as WorkingDocumentKind) ?? "working",
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const WD = () => supabase.schema("workbench").from("working_documents");

// =============================================================================
// Document CRUD (by document id)
// =============================================================================

/**
 * Fetch a single working document by its own id (the durable entity). Used by
 * the realtime/writeback resync path, which keys on the bound document id (NOT
 * a conversation id, so linked conversations resolve correctly).
 */
export async function getCxWorkingDocumentById(
  documentId: string,
): Promise<CxWorkingDocument | null> {
  const { data, error } = await WD()
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (error) {
    throw new Error(`[working-document] get by id failed: ${error.message}`);
  }
  return data ? rowToCxWorkingDocument(data as CxWorkingDocumentRow) : null;
}

/** Persist the user-chosen (or auto-derived) title for a document row. */
export async function updateCxWorkingDocumentTitle(
  id: string,
  title: string,
): Promise<CxWorkingDocument> {
  const { data, error } = await WD()
    .update({ title })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[working-document] title update failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToCxWorkingDocument(data as CxWorkingDocumentRow);
}

/**
 * Direct content write (inline user edits). The agent's own edits land
 * server-side via the ctx_patch writeback handler and arrive back via realtime
 * — they do NOT go through this path.
 */
export async function updateCxWorkingDocumentContent(
  id: string,
  content: string,
): Promise<CxWorkingDocument> {
  const { data, error } = await WD()
    .update({ content })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[working-document] content update failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToCxWorkingDocument(data as CxWorkingDocumentRow);
}

export interface ContentCommitResult {
  /** "saved" — our write landed; "conflict" — a concurrent edit moved the row. */
  status: "saved" | "conflict";
  /** "saved": the new row (with bumped version). "conflict": the CURRENT row. */
  document: CxWorkingDocument;
}

/**
 * OPTIMISTIC-CONCURRENCY user content write. Updates only if the row is still at
 * `baseVersion` (the version the editor's content was based on). If a concurrent
 * edit — typically the agent's ctx_patch this turn — already advanced the row,
 * the write is REFUSED (0 rows) and we return the CURRENT row as a `conflict`
 * instead of blindly clobbering the other party's edit. The caller reflects the
 * current version and surfaces a diff so the user reconciles; both versions are
 * captured in `history.row_versions`, so nothing is ever lost.
 */
export async function commitWorkingDocumentContent(
  id: string,
  content: string,
  baseVersion: number,
): Promise<ContentCommitResult> {
  const { data, error } = await WD()
    .update({ content })
    .eq("id", id)
    .eq("version", baseVersion)
    .select("*")
    .maybeSingle();
  if (error) {
    throw new Error(`[working-document] commit failed: ${error.message}`);
  }
  if (data) {
    return {
      status: "saved",
      document: rowToCxWorkingDocument(data as CxWorkingDocumentRow),
    };
  }
  // 0 rows updated: the version moved (concurrent edit) OR the row is gone.
  const current = await getCxWorkingDocumentById(id);
  if (!current) {
    // Row vanished — fall back to an unconditional write so we don't lose the
    // user's content to a transient read.
    return { status: "saved", document: await updateCxWorkingDocumentContent(id, content) };
  }
  return { status: "conflict", document: current };
}

/**
 * List the current user's documents of a given kind, newest-edited first.
 * Powers the "attach an existing document" picker (cross-conversation linking).
 */
export async function listUserDocuments(
  kind: WorkingDocumentKind,
  limit = 50,
): Promise<CxWorkingDocument[]> {
  const { data, error } = await WD()
    .select("*")
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`[working-document] list failed: ${error.message}`);
  }
  return (data as CxWorkingDocumentRow[]).map(rowToCxWorkingDocument);
}

/** Lightweight rail row — enough to list + preview a document without its body. */
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
 * first — the data behind the DocumentsWorkspace rail. RLS scopes to the owner.
 */
export async function listRecentUserDocuments(
  limit = 100,
): Promise<CxWorkingDocumentSummary[]> {
  const { data, error } = await WD()
    .select("id, conversation_id, kind, title, content, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`[working-document] list recent failed: ${error.message}`);
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
// Materialize-on-write — create the durable row on the first byte of content
// =============================================================================

export interface MaterializeArgs {
  /** The client-reserved row id (created up front, written here on first edit). */
  id: string;
  /** Origin conversation (provenance, stored in metadata — NOT identity). */
  conversationId: string;
  /** Owner org (NOT NULL on the row); the conversation's org. */
  organizationId: string;
  kind: WorkingDocumentKind;
  title: string;
  content: string;
}

// In-flight dedup: the first user edit can fire several debounced commits before
// `materialized` flips. The upsert is idempotent, but collapsing to one promise
// avoids redundant round-trips + a duplicate association write. Keyed by row id.
const inFlightMaterialize = new Map<string, Promise<CxWorkingDocument>>();

/**
 * Create (or resolve, idempotently) the durable `workbench.working_documents`
 * row for a reserved id, writing the first content + title, and ensure the
 * conversation association edge exists. The owner (`created_by`) is stamped by
 * the DB trigger from `auth.uid()`. Returns the row (with its `version`).
 *
 * Idempotent: ON CONFLICT (id) updates content/title, so a concurrent first
 * write resolves to one row. Provenance rides `metadata.origin_conversation_id`
 * (the `conversation_id` column is legacy and being dropped).
 */
export function materializeWorkingDocument(
  args: MaterializeArgs,
): Promise<CxWorkingDocument> {
  const inflight = inFlightMaterialize.get(args.id);
  if (inflight) return inflight;
  const promise = materializeWorkingDocumentImpl(args).finally(() => {
    inFlightMaterialize.delete(args.id);
  });
  inFlightMaterialize.set(args.id, promise);
  return promise;
}

async function materializeWorkingDocumentImpl(
  args: MaterializeArgs,
): Promise<CxWorkingDocument> {
  const { data, error } = await WD()
    .upsert(
      {
        id: args.id,
        organization_id: args.organizationId,
        kind: args.kind,
        title: args.title,
        content: args.content,
        metadata: { origin_conversation_id: args.conversationId } as Json,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[working-document] materialize failed: ${error?.message ?? "no row"}`,
    );
  }
  const doc = rowToCxWorkingDocument(data as CxWorkingDocumentRow);
  // Create the conversation link on the SAME first-content transition. Idempotent
  // (assoc_add upserts the edge), so re-materialize is a no-op on the edge.
  await linkDocumentToConversation({
    documentId: doc.id,
    conversationId: args.conversationId,
    organizationId: args.organizationId,
    kind: args.kind,
    enabled: true,
  });
  return doc;
}

// =============================================================================
// Conversation ↔ document links — platform.associations (M2M)
// =============================================================================

export interface ConversationDocumentLink {
  documentId: string;
  kind: WorkingDocumentKind;
  enabled: boolean;
}

function edgeMetadata(kind: WorkingDocumentKind, enabled: boolean): Json {
  return { enabled, doc_kind: kind } as Json;
}

/**
 * Attach a document to a conversation (idempotent). `assoc_add` REPLACES the
 * edge metadata on conflict, so we always write the full `{enabled, doc_kind}`.
 * `organizationId` is required: the RPC won't auto-derive org for a
 * `conversation` target.
 */
export async function linkDocumentToConversation(args: {
  documentId: string;
  conversationId: string;
  organizationId: string;
  kind: WorkingDocumentKind;
  enabled?: boolean;
}): Promise<void> {
  const res = await associationsService.add({
    sourceType: "working_document",
    sourceId: args.documentId,
    targetType: "conversation",
    targetId: args.conversationId,
    orgId: args.organizationId,
    metadata: edgeMetadata(args.kind, args.enabled ?? true),
  });
  if (isScopesRpcErr(res)) {
    throw new Error(
      `[working-document] link failed: ${res.error.message ?? res.error.code}`,
    );
  }
}

/** Detach a document from a conversation. No-op if the edge doesn't exist. */
export async function unlinkDocumentFromConversation(
  documentId: string,
  conversationId: string,
): Promise<void> {
  const res = await associationsService.remove({
    sourceType: "working_document",
    sourceId: documentId,
    targetType: "conversation",
    targetId: conversationId,
  });
  if (isScopesRpcErr(res)) {
    throw new Error(
      `[working-document] unlink failed: ${res.error.message ?? res.error.code}`,
    );
  }
}

/** Toggle the per-conversation opt-in flag on an existing edge (idempotent add). */
export async function setConversationDocumentEnabled(
  documentId: string,
  conversationId: string,
  organizationId: string,
  kind: WorkingDocumentKind,
  enabled: boolean,
): Promise<void> {
  await linkDocumentToConversation({
    documentId,
    conversationId,
    organizationId,
    kind,
    enabled,
  });
}

/**
 * Every working/scratch document attached to a conversation, with its per-link
 * opt-in flag + kind. Reads the conversation's INCOMING edges in one round-trip.
 */
export async function listConversationDocuments(
  conversationId: string,
): Promise<ConversationDocumentLink[]> {
  const res = await associationsService.listForTargets("conversation", [
    conversationId,
  ]);
  if (isScopesRpcErr(res)) {
    throw new Error(
      `[working-document] list links failed: ${res.error.message ?? res.error.code}`,
    );
  }
  return res.data.edges
    .filter((e) => e.sourceType === "working_document")
    .map((e) => {
      const meta = (e.metadata ?? {}) as { enabled?: boolean; doc_kind?: string };
      return {
        documentId: e.sourceId,
        kind: (meta.doc_kind as WorkingDocumentKind) ?? "working",
        enabled: meta.enabled ?? true,
      };
    });
}

/** Every conversation a document is attached to (for the "linked in N chats" UI). */
export async function listDocumentConversations(
  documentId: string,
): Promise<string[]> {
  const res = await associationsService.listForSources(
    "working_document",
    [documentId],
    "conversation",
  );
  if (isScopesRpcErr(res)) {
    throw new Error(
      `[working-document] list doc conversations failed: ${res.error.message ?? res.error.code}`,
    );
  }
  return res.data.edges.map((e) => e.targetId);
}
