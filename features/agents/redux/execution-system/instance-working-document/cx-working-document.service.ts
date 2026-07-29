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
 * SCRATCH GATE EDGE: the per-conversation scratchpad opt-in is a scratch-kind
 * edge whose source_id is the deterministic `reservedWorkingDocumentId(
 * conversationId, "scratch")` — a PHANTOM id with no backing row (assoc_add
 * doesn't validate sources). It is a pure conversation-level boolean ("send the
 * user's ACTIVE scratchpad here"), never a doc pointer; hydrate paths must skip
 * it when resolving real documents.
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
  kind: string;
  title: string;
  content: string;
  version: number;
  metadata?: { origin_conversation_id?: string | null } | null;
  created_at: string;
  updated_at: string;
}

export interface CxWorkingDocument {
  id: string;
  /**
   * The conversation the document was BORN in (provenance, not identity — a doc
   * is M2M-linked to many conversations). Read from metadata.origin_conversation_id.
   * Keys the doc's tab in the workspace so an attached doc from another chat
   * loads its own content.
   */
  conversationId: string | null;
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
    conversationId: row.metadata?.origin_conversation_id ?? null,
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
    // Authenticated RLS never gates deleted_at (soft-delete class fix) — the
    // read path filters explicitly so a deleted doc reads as "gone".
    .is("deleted_at", null)
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
    return {
      status: "saved",
      document: await updateCxWorkingDocumentContent(id, content),
    };
  }
  return { status: "conflict", document: current };
}

/**
 * Explicit list scope (THE VIEW LAW: RLS is the ceiling, never the list
 * definition). `mine` = documents I created; `shared` = documents RLS lets me
 * read that someone ELSE created (direct grants, org access, reachability
 * through a shared conversation).
 */
export type DocumentListScope = "mine" | "shared";

async function currentUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * List documents of a given kind, newest-edited first, under an EXPLICIT
 * scope. Powers the "attach an existing document" picker (cross-conversation
 * + cross-user linking).
 */
export async function listUserDocuments(
  kind: WorkingDocumentKind,
  limit = 50,
  scope: DocumentListScope = "mine",
): Promise<CxWorkingDocument[]> {
  const uid = await currentUserId();
  if (!uid) return []; // guests own nothing and are granted nothing
  let query = WD()
    .select("*")
    .eq("kind", kind)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  query =
    scope === "mine"
      ? query.eq("created_by", uid)
      : query.neq("created_by", uid);
  const { data, error } = await query;
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
 * List the current user's OWN recent documents across BOTH kinds,
 * newest-edited first — the data behind the DocumentsWorkspace rail. Scope is
 * declared explicitly (`created_by = uid`, THE VIEW LAW): now that working
 * documents are shareable, a bare RLS read would silently flood this personal
 * rail with every document shared with the user.
 */
export async function listRecentUserDocuments(
  limit = 100,
): Promise<CxWorkingDocumentSummary[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await WD()
    .select("id, metadata, kind, title, content, updated_at")
    .eq("created_by", uid)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`[working-document] list recent failed: ${error.message}`);
  }
  return (
    data as Array<
      Pick<
        CxWorkingDocumentRow,
        "id" | "metadata" | "kind" | "title" | "content" | "updated_at"
      >
    >
  ).map((row) => ({
    id: row.id,
    // Origin lives in metadata.origin_conversation_id (the legacy
    // conversation_id column was dropped in STEP 3).
    conversationId: row.metadata?.origin_conversation_id ?? null,
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
  /**
   * Origin conversation (provenance, stored in metadata — NOT identity).
   * Null for USER-GLOBAL scratchpads, which are born outside any conversation
   * and get NO conversation edge at materialize time.
   */
  conversationId: string | null;
  /** Owner org (NOT NULL on the row); the conversation's (or active) org. */
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
        metadata: {
          origin_conversation_id: args.conversationId,
        } as Json,
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
  // User-global scratchpads (no origin conversation) get NO edge — they attach
  // to conversations only when the user explicitly attaches them.
  if (args.conversationId) {
    await linkDocumentToConversation({
      documentId: doc.id,
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      kind: args.kind,
      enabled: true,
    });
  }
  return doc;
}

/**
 * Soft-delete a document (scratchpad delete in the switcher). The row + its
 * full version history survive in the DB; RLS-visible reads filter it out via
 * the explicit `deleted_at is null` guards on the list queries here.
 */
export async function softDeleteWorkingDocument(id: string): Promise<void> {
  const { error } = await WD()
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw new Error(`[working-document] delete failed: ${error.message}`);
  }
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
      const meta = (e.metadata ?? {}) as {
        enabled?: boolean;
        doc_kind?: string;
      };
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

// =============================================================================
// Durable version history (history.row_versions via the CANONICAL versioning
// RPCs — never a raw client read; `history` is audit-locked). The working
// document registers in `platform.entity_types` under token 'working_document',
// so `version_list` / `version_snapshot` / `version_restore` (each gated by
// `iam.has_access`) serve its full version history. Every agent ctx_patch and
// user commit is captured here by the `_history` trigger, so this is the true,
// durable "full version history" — surfaced in the drawer's history panel and
// used as the reload-safe fallback for the agent-diff view.
// =============================================================================

/** The entity token the working document registers under. */
export const WORKING_DOCUMENT_TOKEN = "working_document";

export interface WorkingDocumentVersion {
  version: number;
  /** DB operation that produced this version (INSERT / UPDATE / DELETE). */
  operation: string;
  /** Who made the edit — the agent (service actor) or the user. Null when unknown. */
  actorId: string | null;
  occurredAt: string;
  /** True when this is the document's current live version. */
  isCurrent: boolean;
}

/** List a working document's durable versions, newest first. */
export async function listWorkingDocumentVersions(
  documentId: string,
  limit = 50,
): Promise<WorkingDocumentVersion[]> {
  const { data, error } = await supabase.rpc("version_list", {
    p_token: WORKING_DOCUMENT_TOKEN,
    p_id: documentId,
    p_limit: limit,
  });
  if (error) {
    throw new Error(`[working-document] version_list failed: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    version: r.version,
    operation: r.operation,
    actorId: r.actor_id ?? null,
    occurredAt: r.occurred_at,
    isCurrent: r.is_current,
  }));
}

/** The full text content captured at a given version (from the row snapshot). */
export async function getWorkingDocumentVersionContent(
  documentId: string,
  version: number,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("version_snapshot", {
    p_token: WORKING_DOCUMENT_TOKEN,
    p_id: documentId,
    p_version: version,
  });
  if (error) {
    throw new Error(
      `[working-document] version_snapshot failed: ${error.message}`,
    );
  }
  const content = (data as { content?: unknown } | null)?.content;
  return typeof content === "string" ? content : null;
}

/**
 * Restore a working document to a prior version (content columns only — never
 * identity/ownership). Returns the NEW version number (restore itself captures a
 * fresh version, so history is preserved). Editor access required.
 */
export async function restoreWorkingDocumentVersion(
  documentId: string,
  version: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("version_restore", {
    p_token: WORKING_DOCUMENT_TOKEN,
    p_id: documentId,
    p_version: version,
  });
  if (error) {
    throw new Error(
      `[working-document] version_restore failed: ${error.message}`,
    );
  }
  return data as number;
}
