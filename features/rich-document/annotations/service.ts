// features/rich-document/annotations/service.ts
//
// THE SIDECAR'S STORE CALLS — every one on a canonical door, none new:
//
//   comments, suggestions, resolution → public.cmt_* through the ONE comment
//        seam (features/scopes/host/associationsStore.ts associationsDataSource,
//        where every cmt_* call already crosses), parent-governed by RC-A2;
//   @-mentions → public.cmt_mention_candidates / cmt_mention_notify (RC-B11);
//   private highlights → a content.document of type `annotation` (the
//        person's own, personal) + an `annotates` edge carrying the
//        text_anchor, written through associationsService (the one assoc_*
//        chokepoint). Filed under the PERSON's organization (chair ruling
//        2026-09-25: never the source's organization via the admin read lane);
//   links → any registered record → source, role `anchored_to`, optional
//        text_anchor, same chokepoint. Detaching removes the edge only.
//
// Every refusal comes back as a thrown Error carrying a plain sentence; the
// hook keeps the draft and marks the item `failed`. Nothing here swallows.

import { supabase } from "@/utils/supabase/client";
import { tryWriteOne, WriteDidNotLandError } from "@/utils/supabase/writeOne";
import { associationsDataSource } from "@/features/scopes/host/associationsStore";
import { associationsService } from "@/features/scopes/service/associationsService";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { getUserId } from "@/utils/auth/getUserId";
import { guardedUpdate } from "@ai-matrx/data/db";
import {
  ANCHOR_WRITES_ENABLED,
  ANCHOR_WRITES_OFF_SENTENCE,
  ANCHORED_TO_ROLE,
  ANNOTATES_ROLE,
  ANNOTATION_DOCUMENT_TYPE,
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  type HighlightColor,
} from "./constants";
import { textAnchorProblem, type TextAnchor } from "./anchor";
import { EditConflictError, SidecarError, humanError, isTransportFailure } from "./errors";
import { readAllRows } from "@ai-matrx/data/db";
import type {
  AnnotationAuthor,
  AnnotationItem,
  AnnotationSource,
  CommentReply,
} from "./types";

/** The passage-write gate: a sentence with its remedy, never retryable (Retry cannot switch it on). */
export class AnchorWritesOffError extends SidecarError {
  constructor() {
    super(ANCHOR_WRITES_OFF_SENTENCE, undefined, false);
    this.name = "AnchorWritesOffError";
  }
}

/** Refuse a passage write BEFORE any request while RC-A5 is unapplied. */
export function assertAnchorWritable(anchor: TextAnchor | null | undefined): void {
  if (!anchor) return;
  if (!ANCHOR_WRITES_ENABLED) throw new AnchorWritesOffError();
  const problem = textAnchorProblem(anchor);
  if (problem) throw new Error(`That passage could not be pinned: ${problem}.`);
}

/** Every failure leaves here as a plain sentence (errors.ts); the raw error is logged once. */
const sentence = humanError;

/**
 * Every cmt_* call crosses the ONE comment seam (associationsDataSource.rpc —
 * it owns the task-comment notification tap). Its signature map is generated
 * from types/database.types.ts, which does not yet hold the RC-B11 doors
 * (cmt_add's p_anchor / p_suggested_text, cmt_mention_*): they appear when the
 * chair step migrations/rcb11_comment_collaboration_doors.sql is applied and
 * `pnpm db-types` regenerates. Until then this is the single untyped view of
 * that seam, and every result is shape-checked below before use.
 */
type CommentSeamRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
const commentSeam = associationsDataSource.rpc as unknown as CommentSeamRpc;

async function rpc<T>(fn: string, args: Record<string, unknown>, action: string): Promise<T> {
  const { data, error } = await commentSeam(fn, args);
  if (error) throw sentence(action, error);
  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comments, suggestions, resolution
// ─────────────────────────────────────────────────────────────────────────────

interface CommentRow {
  id: string;
  parent_id: string | null;
  body: string | null;
  created_at: string;
  created_by: string | null;
  author_display_name: string | null;
  author_email: string | null;
  author_avatar_url: string | null;
  anchor?: unknown;
  resolved_at?: string | null;
  suggested_text?: string | null;
  version?: number | null;
  client_request_id?: string | null;
  edited_at?: string | null;
}

function isCommentRow(v: unknown): v is CommentRow {
  return !!v && typeof v === "object" && typeof (v as CommentRow).id === "string"
    && typeof (v as CommentRow).created_at === "string";
}

function authorOf(row: CommentRow): AnnotationAuthor {
  return {
    id: row.created_by,
    name: row.author_display_name || row.author_email || "Someone",
    avatarUrl: row.author_avatar_url,
  };
}

function asAnchor(v: unknown): TextAnchor | null {
  return v && typeof v === "object" && (v as { __kind?: unknown }).__kind === "text_anchor"
    ? (v as TextAnchor)
    : null;
}

export interface CommentThreads {
  items: AnnotationItem[];
  /** True when the read door returns passages/resolution (the RC-B11 doors are applied). */
  collaborationDoors: boolean;
}

/** Every thread on the source, oldest first, replies nested (cmt_list: viewer on the source). */
export async function listCommentThreads(source: AnnotationSource): Promise<CommentThreads> {
  const data = await rpc<unknown>(
    "cmt_list",
    { p_entity_type: source.token, p_entity_id: source.id },
    "loading the comments",
  );
  const rows = Array.isArray(data) ? data.filter(isCommentRow) : [];
  const me = getUserId();
  const roots = new Map<string, AnnotationItem>();
  const replies: CommentRow[] = [];
  let doors = rows.length > 0 ? rows.every((r) => "resolved_at" in r) : false;
  for (const row of rows) {
    if (row.parent_id) {
      replies.push(row);
      continue;
    }
    roots.set(row.id, {
      key: `comment:${row.id}`,
      kind: row.suggested_text != null ? "suggestion" : "comment",
      saveState: "confirmed",
      anchor: asAnchor(row.anchor),
      author: authorOf(row),
      mine: !!me && row.created_by === me,
      createdAt: row.created_at,
      body: row.body ?? "",
      suggestedText: row.suggested_text ?? null,
      resolvedAt: row.resolved_at ?? null,
      replies: [],
      commentId: row.id,
      version: typeof row.version === "number" ? row.version : null,
      editedAt: row.edited_at ?? null,
    });
  }
  for (const row of replies) {
    const parent = row.parent_id ? roots.get(row.parent_id) : undefined;
    const reply: CommentReply = {
      version: typeof row.version === "number" ? row.version : null,
      editedAt: row.edited_at ?? null,
      id: row.id,
      body: row.body ?? "",
      author: authorOf(row),
      createdAt: row.created_at,
      mine: !!me && row.created_by === me,
    };
    if (parent) parent.replies.push(reply);
  }
  if (rows.length === 0) doors = await probeCollaborationDoors(source);
  return { items: [...roots.values()], collaborationDoors: doors };
}

/** An empty thread says nothing about the door's shape: ask the mention door instead. */
async function probeCollaborationDoors(source: AnnotationSource): Promise<boolean> {
  const { error } = await commentSeam("cmt_mention_candidates", {
    p_entity_type: source.token,
    p_entity_id: source.id,
    p_search: "",
    p_limit: 1,
  });
  if (!error) return true;
  const code = (error as { code?: string }).code;
  if (code === "PGRST202" || code === "42883") return false;
  // Any other refusal (e.g. no commenter access) still proves the door exists.
  return true;
}

export interface AddCommentInput {
  source: AnnotationSource;
  body: string;
  parentId?: string | null;
  anchor?: TextAnchor | null;
  suggestedText?: string | null;
  /** Minted once per draft and reused by every Retry — the door answers a repeat with the first row. */
  clientRequestId: string;
  /** The RC-B11 doors are live (cmt_add takes p_client_request_id). */
  doors: boolean;
  /** When the FIRST attempt of this draft started — bounds the lost-response read-back. */
  firstAttemptAt: string;
}

export async function addComment(input: AddCommentInput): Promise<string> {
  assertAnchorWritable(input.anchor);
  if (input.suggestedText != null && !input.anchor) {
    throw new Error("A suggestion replaces a passage — select the text it changes first.");
  }
  const args: Record<string, unknown> = {
    p_entity_type: input.source.token,
    p_entity_id: input.source.id,
    p_body: input.body,
    p_parent_id: input.parentId ?? null,
  };
  // Only name the RC-B11 parameters when used, so a whole-document comment
  // resolves on either the old or the new door identity.
  if (input.anchor) args.p_anchor = input.anchor;
  if (input.suggestedText != null) args.p_suggested_text = input.suggestedText;
  if (input.doors) {
    // The door dedupes on (author, request id): a Retry after a lost response is the first row.
    args.p_client_request_id = input.clientRequestId;
  } else {
    // Until the door dedupes, a Retry first asks whether the lost attempt landed.
    const landed = await findLandedComment(input);
    if (landed) return landed;
  }
  const { data, error } = await commentSeam("cmt_add", args);
  if (error) throw sentence("posting your comment", error);
  if (typeof data !== "string") throw sentence("posting your comment", new Error("the server returned no id"));
  return data;
}

/**
 * The read-back half of an idempotent create, for the door that cannot dedupe yet: my own
 * comment on this source with exactly this text (and parent), created since the first attempt.
 */
async function findLandedComment(input: AddCommentInput): Promise<string | null> {
  const me = getUserId();
  const { data, error } = await commentSeam("cmt_list", { p_entity_type: input.source.token, p_entity_id: input.source.id });
  if (error || !Array.isArray(data)) return null;
  const since = Date.parse(input.firstAttemptAt) - 2000;
  const hit = data.filter(isCommentRow).find((r) =>
    r.created_by === me && (r.body ?? "") === input.body && (r.parent_id ?? null) === (input.parentId ?? null)
    && Date.parse(r.created_at) >= since);
  return hit?.id ?? null;
}

/**
 * Edit my comment as a compare-and-swap. With the RC-B11 door, the database refuses a moved
 * version (40001) and hands back the current text; until then the thread is re-read and the
 * base compared, so an edit never silently overwrites somebody else's. Returns the new version
 * when the door reports it (the realtime echo of exactly this write is then recognised by it).
 */
export async function editComment(
  source: AnnotationSource,
  id: string,
  body: string,
  base: { body: string; version: number | null },
  doors: boolean,
  force = false,
): Promise<number | null> {
  if (doors && base.version != null) {
    const { data, error } = await commentSeam("cmt_edit", { p_id: id, p_body: body, p_expected_version: force ? null : base.version });
    if (error) {
      if ((error as { code?: string }).code === "40001") {
        let current: { body?: string; version?: number } = {};
        try { current = JSON.parse((error as { details?: string }).details ?? "{}"); } catch { /* the thread re-read below still answers */ }
        throw new EditConflictError(current.body ?? "", current.version ?? null);
      }
      throw sentence("saving your edit", error);
    }
    return typeof data === "number" ? data : null;
  }
  if (!force) {
    const { data, error } = await commentSeam("cmt_list", { p_entity_type: source.token, p_entity_id: source.id });
    if (!error && Array.isArray(data)) {
      const row = data.filter(isCommentRow).find((r) => r.id === id);
      if (row && (row.body ?? "") !== base.body) throw new EditConflictError(row.body ?? "", null);
    }
  }
  await rpc("cmt_edit", { p_id: id, p_body: body }, "saving your edit");
  return null;
}

export async function deleteComment(id: string): Promise<void> {
  await rpc("cmt_delete", { p_id: id }, "deleting the comment");
}

export async function resolveComment(id: string, resolved: boolean): Promise<void> {
  await rpc("cmt_resolve", { p_id: id, p_resolved: resolved }, resolved ? "resolving the thread" : "reopening the thread");
}

// ─────────────────────────────────────────────────────────────────────────────
// @-mentions
// ─────────────────────────────────────────────────────────────────────────────

export interface MentionCandidate {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export async function mentionCandidates(
  source: AnnotationSource,
  search: string,
): Promise<MentionCandidate[]> {
  const data = await rpc<unknown>(
    "cmt_mention_candidates",
    { p_entity_type: source.token, p_entity_id: source.id, p_search: search, p_limit: 8 },
    "finding people to mention",
  );
  if (!Array.isArray(data)) return [];
  return data
    .filter((r): r is { user_id: string; display_name: string | null; email: string | null; avatar_url: string | null } =>
      !!r && typeof r === "object" && typeof (r as { user_id?: unknown }).user_id === "string")
    .map((r) => ({ userId: r.user_id, name: r.display_name || r.email || "Someone", email: r.email, avatarUrl: r.avatar_url }));
}

export interface MentionNoticeResult {
  told: string[];
  skipped: { user_id: string; why: string }[];
}

export async function notifyMentions(
  commentId: string,
  userIds: string[],
  deepLink: string | undefined,
): Promise<MentionNoticeResult> {
  if (userIds.length === 0) return { told: [], skipped: [] };
  const data = await rpc<unknown>(
    "cmt_mention_notify",
    { p_comment_id: commentId, p_recipients: userIds, p_deep_link: deepLink ?? null },
    "telling the people you mentioned",
  );
  const r = (data ?? {}) as Partial<MentionNoticeResult>;
  return { told: Array.isArray(r.told) ? r.told : [], skipped: Array.isArray(r.skipped) ? r.skipped : [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Private highlights: annotation document + `annotates` edge
// ─────────────────────────────────────────────────────────────────────────────

function colorOf(metadata: unknown): HighlightColor {
  const c = metadata && typeof metadata === "object" ? (metadata as { color?: unknown }).color : undefined;
  return HIGHLIGHT_COLORS.includes(c as HighlightColor) ? (c as HighlightColor) : DEFAULT_HIGHLIGHT_COLOR;
}

export interface CreateHighlightInput {
  source: AnnotationSource;
  /** Null = a private note on the whole document (no passage, no anchor write). */
  anchor: TextAnchor | null;
  color: HighlightColor;
  note: string;
  /** Minted once per draft; it IS the annotation document's id, so a Retry finds the first write. */
  clientRequestId: string;
}

/**
 * A private highlight or note as ONE transaction (content.annotation_create): the personal
 * annotation document and its `annotates` edge both exist or neither does — a refused edge can
 * never strand an invisible record (verify-RC-B11 F4). Filed in the person's own organization.
 */
export async function createHighlight(input: CreateHighlightInput): Promise<{ documentId: string; edgeId: string }> {
  assertAnchorWritable(input.anchor);
  const orgId = await ensureOrgId(null);
  const call = supabase.schema("content").rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  const { data, error } = await call("annotation_create", {
    p_id: input.clientRequestId,
    p_organization_id: orgId,
    p_source_type: input.source.token,
    p_source_id: input.source.id,
    p_body: input.note,
    p_color: input.color,
    p_anchor: input.anchor,
  });
  if (error) throw sentence(input.anchor ? "saving your highlight" : "saving your note", error);
  const row = (Array.isArray(data) ? data[0] : data) as { document_id?: string; edge_id?: string } | null;
  if (!row?.document_id) throw sentence("saving your note", new Error("the server returned no record"));
  return { documentId: row.document_id, edgeId: row.edge_id ?? "" };
}

/**
 * Rewrite the `annotates` edge: new colour and/or new passages. Passages are
 * sent as an explicit text_anchor_set — the database MERGES a lone
 * text_anchor into what the edge holds, so a reattach or a recolour must say
 * the whole set (content-ir text_anchor_set contract).
 */
export async function rewriteHighlightEdge(
  source: AnnotationSource,
  documentId: string,
  anchors: TextAnchor[],
  color: HighlightColor,
): Promise<void> {
  for (const a of anchors) assertAnchorWritable(a);
  const res = await associationsService.add({
    sourceType: "document",
    sourceId: documentId,
    targetType: source.token as never,
    targetId: source.id,
    role: ANNOTATES_ROLE,
    metadata: { color },
    ...(anchors.length > 0
      ? { payloadKind: "text_anchor_set", payload: { __kind: "text_anchor_set", anchors } }
      : {}),
  });
  if (!res.ok) throw sentence("updating your highlight", res.error);
}

export async function saveHighlightNote(documentId: string, note: string): Promise<void> {
  const result = await guardedUpdate<{ id: string; version: number }>({
    expectedVersion: await currentVersion(documentId),
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      supabase.schema("content").from("document")
        .update({ body: note, version: nextVersion })
        .eq("id", documentId).eq("version", expectedVersion)
        .select("id, version").maybeSingle(),
    fetchCurrent: () =>
      supabase.schema("content").from("document").select("id, version").eq("id", documentId).maybeSingle(),
    rebase: { isPhantom: () => true },
  });
  if (result.status !== "saved") throw humanError("saving your note", new Error("it was changed or removed elsewhere — reload to see it"));
}

async function currentVersion(documentId: string): Promise<number> {
  const { data, error } = await supabase.schema("content").from("document").select("version").eq("id", documentId).maybeSingle();
  if (error || !data) throw sentence("reading your highlight", error ?? "it no longer exists");
  return data.version as number;
}

/** Soft-delete the annotation; its edge is tombstoned with it. The source is untouched. */
export async function deleteHighlight(documentId: string): Promise<void> {
  const { error } = await tryWriteOne(
    supabase
      .schema("content")
      .from("document")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", documentId)
      .select("id"),
    { action: "remove", noun: "highlight" },
  );
  if (error) throw error instanceof WriteDidNotLandError ? error : sentence("removing your highlight", error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading highlights and links (edges INTO the source)
// ─────────────────────────────────────────────────────────────────────────────

interface IncomingEdgeRow {
  id: string;
  source_type: string;
  source_id: string;
  role: string | null;
  metadata: unknown;
  created_at: string;
}

interface EdgePayloadRow {
  id: string;
  payload: unknown;
  payload_kind: string | null;
  created_by: string | null;
}

async function edgePayloads(ids: string[]): Promise<Map<string, EdgePayloadRow>> {
  const out = new Map<string, EdgePayloadRow>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .schema("platform")
      .from("associations")
      .select("id, payload, payload_kind, created_by")
      .in("id", ids.slice(i, i + 200))
      .is("deleted_at", null);
    if (error) throw sentence("loading the highlighted passages", error);
    for (const row of (data ?? []) as EdgePayloadRow[]) out.set(row.id, row);
  }
  return out;
}

/** The anchors an edge carries (a single passage or a set). */
export function anchorsOfPayload(kind: string | null, payload: unknown): TextAnchor[] {
  if (kind === "text_anchor") {
    const a = asAnchor(payload);
    return a ? [a] : [];
  }
  if (kind === "text_anchor_set" && payload && typeof payload === "object") {
    const list = (payload as { anchors?: unknown }).anchors;
    return Array.isArray(list) ? list.map(asAnchor).filter((a): a is TextAnchor => !!a) : [];
  }
  return [];
}

export interface EdgeItems {
  highlights: AnnotationItem[];
  links: AnnotationItem[];
}

/**
 * My highlights and every link on the source. Highlights: only annotation
 * documents I can read (they are personal — RLS answers mine). Links: every
 * `anchored_to` edge into the source, titles hydrated by the entity registry.
 */
export async function listEdgeItems(
  source: AnnotationSource,
  titleFor: (token: string, ids: string[]) => Promise<Map<string, string>>,
): Promise<EdgeItems> {
  // A direct, live-only read of the edges INTO this source (RLS is the ceiling; tombstones
  // excluded). It does not go through the package's token guard, so a source type the installed
  // vocabulary does not list yet still shows its highlights and links.
  const rows = await readAllRows<IncomingEdgeRow>(
    ({ from, to }) => supabase.schema("platform").from("associations")
      .select("id, source_type, source_id, role, metadata, created_at", { count: "exact" })
      .eq("target_type", source.token).eq("target_id", source.id)
      .in("role", [ANNOTATES_ROLE, ANCHORED_TO_ROLE]).is("deleted_at", null)
      .order("created_at").order("id").range(from, to),
    { label: "platform.associations into an annotated source" },
  ).catch((e: unknown) => { throw sentence("loading highlights and links", e); });
  const incoming = rows.map((r) => ({
    id: r.id, otherType: r.source_type, otherId: r.source_id, role: r.role,
    metadata: r.metadata, createdAt: r.created_at,
  }));
  const annotates = incoming.filter((e) => e.role === ANNOTATES_ROLE && e.otherType === "document");
  const links = incoming.filter((e) => e.role === ANCHORED_TO_ROLE);
  const payloads = await edgePayloads([...annotates, ...links].map((e) => e.id));
  const me = getUserId();

  const highlights: AnnotationItem[] = [];
  if (annotates.length > 0) {
    const { data, error } = await supabase
      .schema("content")
      .from("document")
      .select("id, body, created_at, created_by")
      .in("id", annotates.map((e) => e.otherId))
      .is("deleted_at", null);
    if (error) throw sentence("loading your highlights", error);
    const docs = new Map((data ?? []).map((d) => [d.id as string, d]));
    for (const edge of annotates) {
      const doc = docs.get(edge.otherId);
      if (!doc || doc.created_by !== me) continue; // personal: only the author's own
      const payload = payloads.get(edge.id);
      const anchors: (TextAnchor | null)[] = anchorsOfPayload(payload?.payload_kind ?? null, payload?.payload);
      if (anchors.length === 0) anchors.push(null); // a private note on the whole document
      for (const anchor of anchors) {
        highlights.push({
          key: `highlight:${edge.id}:${anchor?.start ?? "doc"}`,
          kind: anchor ? "highlight" : "note",
          saveState: "confirmed",
          anchor,
          author: { id: me, name: "You" },
          mine: true,
          createdAt: (doc.created_at as string) ?? edge.createdAt,
          body: (doc.body as string) ?? "",
          color: colorOf(edge.metadata),
          replies: [],
          annotationDocumentId: edge.otherId,
          edgeId: edge.id,
        });
      }
    }
  }

  const byToken = new Map<string, string[]>();
  for (const e of links) byToken.set(e.otherType, [...(byToken.get(e.otherType) ?? []), e.otherId]);
  const titles = new Map<string, string>();
  for (const [token, ids] of byToken) {
    const t = await titleFor(token, ids);
    for (const [id, title] of t) titles.set(`${token}:${id}`, title);
  }
  const linkItems: AnnotationItem[] = [];
  for (const edge of links) {
    const payload = payloads.get(edge.id);
    const anchors = anchorsOfPayload(payload?.payload_kind ?? null, payload?.payload);
    const base = {
      kind: "link" as const,
      saveState: "confirmed" as const,
      author: { id: payload?.created_by ?? null, name: payload?.created_by === me ? "You" : "A collaborator" },
      mine: payload?.created_by === me,
      createdAt: edge.createdAt,
      body: "",
      replies: [],
      edgeId: edge.id,
      link: { token: edge.otherType, id: edge.otherId, title: titles.get(`${edge.otherType}:${edge.otherId}`) ?? "Untitled" },
    };
    if (anchors.length === 0) linkItems.push({ ...base, key: `link:${edge.id}`, anchor: null });
    for (const anchor of anchors) linkItems.push({ ...base, key: `link:${edge.id}:${anchor.start}`, anchor });
  }
  return { highlights, links: linkItems };
}

export interface LinkInput {
  source: AnnotationSource;
  token: string;
  id: string;
  anchor: TextAnchor | null;
}

/** Link an existing record to the source (the whole document, or one passage). Idempotent. */
export async function linkRecord(input: LinkInput): Promise<string> {
  assertAnchorWritable(input.anchor);
  const orgId = await ensureOrgId(null);
  const res = await associationsService.add({
    sourceType: input.token,
    sourceId: input.id,
    targetType: input.source.token as never,
    targetId: input.source.id,
    orgId,
    role: ANCHORED_TO_ROLE,
    ...(input.anchor ? { payloadKind: "text_anchor", payload: input.anchor } : {}),
  });
  if (!res.ok) throw sentence("linking the record", res.error);
  return res.data.id;
}

/** Detach: removes the edge, never the linked record. */
export async function unlinkRecord(source: AnnotationSource, token: string, id: string): Promise<void> {
  const res = await associationsService.remove({
    sourceType: token,
    sourceId: id,
    targetType: source.token,
    targetId: source.id,
    role: ANCHORED_TO_ROLE,
  });
  if (!res.ok) throw sentence("detaching the record", res.error);
}
