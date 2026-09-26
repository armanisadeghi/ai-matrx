// features/rich-document/annotations/useAnnotationSidecar.ts
//
// The sidecar's state: every comment thread, suggestion, private highlight /
// note and link on ONE source, each resolved against the current body by the
// one resolver, plus the actions that write them. Drafts are optimistic but
// HONEST: an item is `pending` until the server confirms it, and a refusal
// leaves it `failed` with its sentence and a Retry — it never looks saved.
// New comments by others arrive live (postgres_changes on platform.comments,
// RLS-authorized per subscriber by RC-A2's parent rule) and on every
// reconnect / tab wake (onBackfill).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";
import { getUserId } from "@/utils/auth/getUserId";
import { ANCHOR_WRITES_ENABLED, DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from "./constants";
import type { TextAnchor } from "./anchor";
import { resolveAnchor } from "./resolve";
import { applySuggestion } from "./suggestion";
import { mentionedUserIds } from "./mentions";
import {
  addComment,
  createHighlight,
  deleteComment,
  deleteHighlight,
  editComment,
  linkRecord,
  listCommentThreads,
  listEdgeItems,
  notifyMentions,
  resolveComment,
  rewriteHighlightEdge,
  saveHighlightNote,
  unlinkRecord,
  type MentionNoticeResult,
} from "./service";
import type {
  AnnotationItem,
  AnnotationSource,
  ResolvedItem,
  SidecarCapabilities,
} from "./types";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { organizationRefusalMessage } from "@/lib/organizations/organizationRefusalToast";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { createEchoLedger, isOwnEcho } from "./echo";
import { humanError } from "./errors";

/** One id per draft, reused by every Retry of it (the idempotency key). */
export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

const commentsChannel = defineChannelNamespace({
  namespace: "annotation-sidecar-comments",
  parts: ["entityId"],
  description: "platform.comments changes on one annotated source (RC-B11 sidecar)",
});

function message(e: unknown): string {
  return failure(e).error;
}

function failure(e: unknown): { error: string; retryable: boolean } {
  // The write path resolves the organization (ensureOrgId); a refusal for want of one is said in
  // words with its remedy, never as the transport's error text.
  if (isOrganizationRequiredError(e)) return { error: organizationRefusalMessage({ act: "saved", subject: "This annotation" }), retryable: true };
  const h = humanError("saving", e);
  return { error: h.message, retryable: h.retryable };
}

/**
 * THE DELETE/RESTORE NOTICE (RC-A2g, DB half live 2026-09-26 03:17:56Z). A soft delete or a
 * restore stops being visible to postgres_changes (RLS no longer shows the row), so the
 * database broadcasts a notice on one private topic per RECORD: `comments:<entity_type>:<id>`,
 * admitted by `platform.comments_topic_admits` — viewer on the record, exactly who may see its
 * thread. The payload is ids only (id, comment_id, entity_type, entity_id, op, at); this tab
 * re-reads through cmt_list. The topic is the database's contract, hence `foreignTopic`.
 */
const commentNoticeChannel = defineChannelNamespace({
  namespace: "record-comment-notices",
  foreignTopic: "comments",
  parts: ["entityType", "entityId"],
  description: "Private per-record notice that a comment was deleted or restored (ids only); the thread is re-read through cmt_list.",
});

interface CommentNotice {
  /** The notice's own id (dedup key). */
  id?: string;
  comment_id?: string;
  entity_type?: string;
  entity_id?: string;
  op?: "deleted" | "restored";
  at?: string;
}

let draftSeq = 0;
function draftKey(): string {
  draftSeq += 1;
  return `draft:${Date.now().toString(36)}:${draftSeq}`;
}

export interface SidecarState {
  items: ResolvedItem[];
  loading: boolean;
  /** A read failure — shown, never turned into an empty list. */
  error: string | null;
  capabilities: SidecarCapabilities;
}

export interface CommentDraft {
  body: string;
  anchor: TextAnchor | null;
  suggestedText?: string | null;
  /** A reply: written through (it throws on failure so its composer keeps the text). */
  parentId?: string | null;
  /** The reply composer's own stable id, reused when the person presses Reply again after a failure. */
  clientRequestId?: string;
}

export function useAnnotationSidecar(source: AnnotationSource | null) {
  const [confirmed, setConfirmed] = useState<AnnotationItem[]>([]);
  const [drafts, setDrafts] = useState<AnnotationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doors, setDoors] = useState(false);
  const [capturedBodies, setCapturedBodies] = useState<Record<number, string | null>>({});
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const loadSeq = useRef(0);

  const sourceKey = source ? `${source.token}:${source.id}` : null;

  const reload = useCallback(async () => {
    const src = sourceRef.current;
    if (!src) return;
    const seq = ++loadSeq.current;
    setError(null);
    // The two halves load independently: a refused edge read must never hide
    // the comment threads (or the reverse). Each failure is shown by name.
    const titles = getAssociationsStore().titles;
    const [threads, edges] = await Promise.allSettled([
      listCommentThreads(src),
      listEdgeItems(src, (token, ids) => titles.fetch(token, ids)),
    ]);
    if (seq !== loadSeq.current) return;
    const next: AnnotationItem[] = [];
    const errors: string[] = [];
    if (threads.status === "fulfilled") {
      next.push(...threads.value.items);
      setDoors(threads.value.collaborationDoors);
    } else errors.push(message(threads.reason));
    if (edges.status === "fulfilled") next.push(...edges.value.highlights, ...edges.value.links);
    else errors.push(message(edges.reason));
    setConfirmed(next);
    setError(errors.length ? errors.join(" ") : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    setConfirmed([]);
    setDrafts([]);
    setLoading(true);
    setCapturedBodies({});
    if (sourceKey) void reload();
  }, [sourceKey, reload]);

  // Older captured versions the resolver can map through (one read per version).
  const anchorVersions = [...confirmed, ...drafts]
    .map((i) => i.anchor?.content_version)
    .filter((v): v is number => typeof v === "number");
  const versionKey = [...new Set(anchorVersions)].sort((a, b) => a - b).join(",");
  useEffect(() => {
    const src = sourceRef.current;
    if (!src?.readVersionBody) return;
    const wanted = versionKey
      .split(",")
      .filter(Boolean)
      .map(Number)
      .filter((v) => v !== src.contentVersion && !(v in capturedBodies));
    if (wanted.length === 0) return;
    let stale = false;
    void Promise.all(
      wanted.map(async (v) => [v, await src.readVersionBody!(v).catch(() => null)] as const),
    ).then((pairs) => {
      if (stale) return;
      setCapturedBodies((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      stale = true;
    };
  }, [versionKey, source?.contentVersion, capturedBodies]);

  // Live comments from everyone who can read the source. Own echoes are recognised by the
  // exact writes this tab made (echo.ts), never by a time window.
  const ledger = useRef(createEchoLedger());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void reload(), 250);
  }, [reload]);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);
  useChannel(
    source
      ? {
          topic: commentsChannel.topic({ entityId: source.id }),
          postgresChanges: [
            {
              event: "*",
              schema: "platform",
              table: "comments",
              filter: `entity_id=eq.${source.id}`,
              rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
              onChange: ({ row, payload }) => {
                // This tab's own writes already reloaded when the door answered.
                if (isOwnEcho(String(payload?.eventType ?? ""), row, ledger.current)) return;
                scheduleReload();
              },
            },
          ],
          onBackfill: async () => {
            await reload();
          },
        }
      : null,
  );
  const onCommentNotice = useCallback(
    (message: { data?: unknown }) => {
      const notice = (message.data ?? {}) as CommentNotice;
      // This tab's own delete already reloaded when the door answered.
      if (notice.op === "deleted" && notice.comment_id && ledger.current.deletedIds.has(notice.comment_id)) return;
      scheduleReload();
    },
    [scheduleReload],
  );
  useChannel(
    source
      ? {
          topic: commentNoticeChannel.topic({ entityType: source.token, entityId: source.id }),
          // Authorized by RLS on realtime.messages; the package awaits setAuth() before joining.
          // realtime-admission: comments
          private: true,
          // The sender is Postgres: no Matrx envelope, so echo suppression is done above, by
          // the ids this tab deleted (echo.ts ledger).
          wire: { mode: "raw" },
          // Every notice carries its own id (gen_random_uuid() in platform._comments_announce_delete).
          eventKey: (_source, payload) => ((payload ?? {}) as CommentNotice).id,
          broadcast: [
            { event: "comment.deleted", onMessage: onCommentNotice },
            { event: "comment.restored", onMessage: onCommentNotice },
          ],
          onBackfill: async () => {
            await reload();
          },
        }
      : null,
  );

  // ── resolution ──────────────────────────────────────────────────────────
  const items: ResolvedItem[] = [...confirmed, ...drafts].map((item) => ({
    ...item,
    resolution:
      item.anchor && source
        ? resolveAnchor({
            anchor: item.anchor,
            body: source.body,
            contentVersion: source.contentVersion,
            capturedBody: capturedBodies[item.anchor.content_version] ?? null,
          })
        : null,
  }));

  // ── drafts: pending → confirmed | failed (kept for retry) ──────────────
  const runDraft = useCallback(
    async (draft: AnnotationItem, write: () => Promise<void>) => {
      setDrafts((d) => [...d.filter((x) => x.key !== draft.key), { ...draft, saveState: "pending", error: undefined, retryable: undefined }]);
      if (draft.clientRequestId) ledger.current.createdRequestIds.add(draft.clientRequestId);
      try {
        await write();
        setDrafts((d) => d.filter((x) => x.key !== draft.key));
        await reload();
        return true;
      } catch (e) {
        setDrafts((d) =>
          d.map((x) => (x.key === draft.key ? { ...x, saveState: "failed", ...failure(e) } : x)),
        );
        return false;
      }
    },
    [reload],
  );

  const me = () => ({ id: getUserId(), name: "You" });
  const now = () => new Date().toISOString();

  const postComment = useCallback(
    async (input: CommentDraft): Promise<MentionNoticeResult | null> => {
      const src = sourceRef.current;
      if (!src) return null;
      let notice: MentionNoticeResult | null = null;
      if (input.parentId) {
        // A reply is written straight through and THROWS on failure, so the reply composer
        // keeps the text on screen with its error and the same request id for the next try.
        const requestId = input.clientRequestId ?? newRequestId();
        ledger.current.createdRequestIds.add(requestId);
        const id = await addComment({
          source: src, body: input.body, parentId: input.parentId,
          clientRequestId: requestId, doors, firstAttemptAt: now(),
        });
        await reload();
        const mentions = mentionedUserIds(input.body);
        return mentions.length && doors ? notifyMentions(id, mentions, src.href) : null;
      }
      const draft: AnnotationItem = {
        key: draftKey(),
        kind: input.suggestedText != null ? "suggestion" : "comment",
        saveState: "pending",
        anchor: input.anchor,
        author: me(),
        mine: true,
        createdAt: now(),
        body: input.body,
        suggestedText: input.suggestedText ?? null,
        replies: [],
        clientRequestId: newRequestId(),
        firstAttemptAt: now(),
      };
      await runDraft(draft, async () => {
        const id = await writeComment(src, draft);
        const mentions = mentionedUserIds(input.body);
        if (mentions.length && doors) notice = await notifyMentions(id, mentions, src.href);
      });
      return notice;
    },
    [doors, reload, runDraft],
  );

  const writeComment = (src: AnnotationSource, item: AnnotationItem) =>
    addComment({
      source: src,
      body: item.body,
      anchor: item.anchor,
      suggestedText: item.suggestedText ?? null,
      clientRequestId: item.clientRequestId ?? newRequestId(),
      firstAttemptAt: item.firstAttemptAt ?? now(),
      doors,
    });

  const addHighlight = useCallback(
    async (anchor: TextAnchor | null, color: HighlightColor = DEFAULT_HIGHLIGHT_COLOR, note = "", retryOf?: AnnotationItem) => {
      const src = sourceRef.current;
      if (!src) return false;
      const draft: AnnotationItem = retryOf ?? {
        key: draftKey(),
        kind: anchor ? "highlight" : "note",
        saveState: "pending",
        anchor,
        author: me(),
        mine: true,
        createdAt: now(),
        body: note,
        color,
        replies: [],
        clientRequestId: newRequestId(),
        firstAttemptAt: now(),
      };
      return runDraft(draft, async () => {
        await createHighlight({
          source: src,
          anchor: draft.anchor,
          color: draft.color ?? color,
          note: draft.body,
          clientRequestId: draft.clientRequestId ?? newRequestId(),
        });
      });
    },
    [runDraft],
  );

  const retry = useCallback(
    async (item: AnnotationItem) => {
      if (item.kind === "highlight" || item.kind === "note") return addHighlight(item.anchor, item.color, item.body, item);
      if (item.kind === "link" && item.link) {
        const src = sourceRef.current;
        if (!src) return false;
        return runDraft(item, async () => {
          await linkRecord({ source: src, token: item.link!.token, id: item.link!.id, anchor: item.anchor });
        });
      }
      const src = sourceRef.current;
      if (!src) return false;
      // Same draft, same request id: the door (or the read-back) finds a write that already landed.
      return runDraft(item, async () => {
        await writeComment(src, item);
      });
    },
    [addHighlight, runDraft, doors],
  );

  /** A comment whose PASSAGE could not be saved, posted on the whole document instead (same text, new request id). */
  const postOnWholeDocument = useCallback(
    async (item: AnnotationItem) => {
      const src = sourceRef.current;
      if (!src || (item.kind !== "comment" && item.kind !== "suggestion")) return false;
      const whole: AnnotationItem = { ...item, kind: "comment", anchor: null, suggestedText: null, clientRequestId: newRequestId(), firstAttemptAt: now() };
      return runDraft(whole, async () => {
        await writeComment(src, whole);
      });
    },
    [runDraft, doors],
  );

  const discardDraft = useCallback((key: string) => {
    setDrafts((d) => d.filter((x) => x.key !== key));
  }, []);

  const link = useCallback(
    async (token: string, id: string, title: string, anchor: TextAnchor | null) => {
      const src = sourceRef.current;
      if (!src) return false;
      const draft: AnnotationItem = {
        key: draftKey(),
        kind: "link",
        saveState: "pending",
        anchor,
        author: me(),
        mine: true,
        createdAt: now(),
        body: "",
        replies: [],
        link: { token, id, title },
      };
      return runDraft(draft, async () => {
        await linkRecord({ source: src, token, id, anchor });
      });
    },
    [runDraft],
  );

  const act = useCallback(
    async (fn: () => Promise<void>) => {
      try {
        await fn();
        await reload();
        return null;
      } catch (e) {
        return message(e);
      }
    },
    [reload],
  );

  const acceptSuggestion = useCallback(
    async (item: ResolvedItem): Promise<string | null> => {
      const src = sourceRef.current;
      if (!src?.save || !item.anchor || item.suggestedText == null || !item.commentId) {
        return "This document cannot be edited here, so the suggestion cannot be applied.";
      }
      try {
        const { nextBody } = applySuggestion(src.body, src.contentVersion, item.anchor, item.suggestedText);
        await src.save(nextBody);
        await resolveComment(item.commentId, true);
        await reload();
        return null;
      } catch (e) {
        return message(e);
      }
    },
    [reload],
  );

  /**
   * Edit my comment or reply as a compare-and-swap against the text the editor opened with.
   * THROWS (EditConflictError with the current text, or a plain SidecarError) so the editor
   * stays open with the person's words; `force` overwrites after they chose to.
   */
  const editMine = useCallback(
    async (commentId: string, body: string, base: { body: string; version: number | null }, force = false) => {
      const src = sourceRef.current;
      if (!src) return;
      const version = await editComment(src, commentId, body, base, doors, force);
      if (version != null) ledger.current.writtenVersions.set(commentId, version);
      await reload();
    },
    [doors, reload],
  );

  const capabilities: SidecarCapabilities = {
    anchoredWrites: ANCHOR_WRITES_ENABLED,
    collaborationDoors: doors,
    links: !!(source && tryGetEntityInfo(source.token)),
    paint: typeof CSS !== "undefined" && "highlights" in CSS,
  };

  return {
    state: { items, loading, error, capabilities } satisfies SidecarState,
    reload,
    postComment,
    addHighlight,
    link,
    retry,
    postOnWholeDocument,
    discardDraft,
    acceptSuggestion,
    rejectSuggestion: (commentId: string) => act(() => deleteComment(commentId)),
    editComment: editMine,
    deleteComment: (commentId: string) =>
      act(async () => {
        ledger.current.deletedIds.add(commentId);
        await deleteComment(commentId);
      }),
    resolveComment: (commentId: string, resolved: boolean) => act(() => resolveComment(commentId, resolved)),
    saveNote: (documentId: string, note: string) => act(() => saveHighlightNote(documentId, note)),
    removeHighlight: (documentId: string) => act(() => deleteHighlight(documentId)),
    recolor: (item: ResolvedItem, color: HighlightColor) =>
      act(async () => {
        const src = sourceRef.current;
        if (!src || !item.annotationDocumentId) return;
        const siblings = confirmed
          .filter((c) => c.annotationDocumentId === item.annotationDocumentId && c.anchor)
          .map((c) => c.anchor!);
        await rewriteHighlightEdge(src, item.annotationDocumentId, siblings, color);
      }),
    reattach: (item: ResolvedItem, anchor: TextAnchor) =>
      act(async () => {
        const src = sourceRef.current;
        if (!src) return;
        if ((item.kind === "highlight" || item.kind === "note") && item.annotationDocumentId) {
          const others = confirmed
            .filter((c) => c.annotationDocumentId === item.annotationDocumentId && c.anchor && c.key !== item.key)
            .map((c) => c.anchor!);
          await rewriteHighlightEdge(src, item.annotationDocumentId, [...others, anchor], item.color ?? DEFAULT_HIGHLIGHT_COLOR);
        } else if (item.kind === "link" && item.link) {
          await linkRecord({ source: src, token: item.link.token, id: item.link.id, anchor });
        }
      }),
    unlink: (token: string, id: string) =>
      act(async () => {
        const src = sourceRef.current;
        if (src) await unlinkRecord(src, token, id);
      }),
  };
}

export type AnnotationSidecarApi = ReturnType<typeof useAnnotationSidecar>;
