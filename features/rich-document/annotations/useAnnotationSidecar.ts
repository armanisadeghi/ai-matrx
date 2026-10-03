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
//
// 🚨 THE CONFIRMED ITEMS ARE KEPT BY SOURCE, NOT BY THIS HOOK (`sidecarStore.ts`, the remount
// law 2026-10-03): read once per tab, one ref-counted pair of channels per source. A view that
// sleeps and wakes, a Remove + Undo, or a second view of the same record renders the kept answer
// and reads nothing (it used to read `cmt_list` and `platform.associations` on every mount).

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useRealtimeManager } from "@ai-matrx/realtime/react";
import { getUserId } from "@/utils/auth/getUserId";
import { ANCHOR_WRITES_ENABLED, DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from "./constants";
import type { TextAnchor } from "./anchor";
import { resolveAnchor } from "./resolve";
import { applySuggestion } from "./suggestion";
import { mentionedUserIds } from "./mentions";
import { WriteDidNotLandError } from "@/utils/supabase/writeOne";
import {
  addComment,
  canEditSource,
  createHighlight,
  deleteComment,
  restoreComment,
  restoreHighlight,
  deleteHighlight,
  editComment,
  linkRecord,
  listCommentThreads,
  annotationPairs,
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
import {
  ensureCapturedBodies,
  holdSidecarLive,
  loadSidecar,
  scheduleSidecarReload,
  sidecarKey,
  sidecarLedger,
  sidecarSnapshot,
  subscribeSidecars,
} from "./sidecarStore";
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

/** A delete/restore notice: this tab's own delete already reloaded when the door answered. */
function onCommentNotice(
  ledger: ReturnType<typeof createEchoLedger>,
  received: { data?: unknown },
  changed: () => void,
): void {
  const notice = (received.data ?? {}) as CommentNotice;
  if (notice.op === "deleted" && notice.comment_id && ledger.deletedIds.has(notice.comment_id)) return;
  changed();
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
  /** Called with the platform.comments id once the comment is written (a top-level comment's first write). */
  onWritten?: (commentId: string) => void;
}

export function useAnnotationSidecar(source: AnnotationSource | null) {
  const [drafts, setDrafts] = useState<AnnotationItem[]>([]);
  const [pairsError, setPairsError] = useState<string | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // Keyed by the person too: one person's kept answer is never another's.
  const sourceKey = source ? `${getUserId() ?? "-"}|${sidecarKey(source)}` : null;
  const kept = useSyncExternalStore(
    subscribeSidecars,
    () => sidecarSnapshot(sourceKey),
    () => sidecarSnapshot(null),
  );
  const { confirmed, doors, canEdit, capturedBodies } = kept;
  const loading = sourceKey ? kept.loading : true;
  const error = kept.error ?? pairsError;
  // This tab's own writes, shared by every view of the source, so their echoes are not news.
  const ownLedger = useRef(createEchoLedger());
  const ledger = { current: sourceKey ? sidecarLedger(sourceKey) : ownLedger.current };

  const reload = useCallback(async () => {
    const src = sourceRef.current;
    if (!src) return;
    await loadSidecar(`${getUserId() ?? "-"}|${sidecarKey(src)}`, src, { force: true, describe: message });
  }, []);

  // Mount and wake: read unless the source is already kept (and current).
  useEffect(() => {
    setDrafts([]);
    const src = sourceRef.current;
    if (sourceKey && src) void loadSidecar(sourceKey, src, { describe: message });
  }, [sourceKey]);

  // Older captured versions the resolver can map through (one read per version, kept by source).
  const anchorVersions = [...confirmed, ...drafts]
    .map((i) => i.anchor?.content_version)
    .filter((v): v is number => typeof v === "number");
  const versionKey = [...new Set(anchorVersions)].sort((a, b) => a - b).join(",");
  useEffect(() => {
    const src = sourceRef.current;
    if (!src || !sourceKey) return;
    ensureCapturedBodies(sourceKey, src, versionKey.split(",").filter(Boolean).map(Number));
  }, [versionKey, sourceKey, source?.contentVersion]);

  // Live comments from everyone who can read the source — ONE pair of channels per source, however
  // many views hold it, open while any does (and a grace after). Own echoes are recognised by the
  // exact writes this tab made (echo.ts), never by a time window.
  const manager = useRealtimeManager();
  const sourceId = source?.id ?? null;
  const sourceToken = source?.token ?? null;
  useEffect(() => {
    if (!manager || !sourceKey || !sourceId || !sourceToken) return undefined;
    const key = sourceKey;
    const current = () => sourceRef.current;
    const changed = () => scheduleSidecarReload(key, current);
    const backfill = async () => {
      const src = current();
      if (src) await loadSidecar(key, src, { force: true, describe: message });
    };
    return holdSidecarLive(key, manager, () => {
      const keptLedger = sidecarLedger(key);
      const comments = manager.open({
        topic: commentsChannel.topic({ entityId: sourceId }),
        postgresChanges: [
          {
            event: "*",
            schema: "platform",
            table: "comments",
            filter: `entity_id=eq.${sourceId}`,
            rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
            onChange: ({ row, payload }) => {
              // This tab's own writes already reloaded when the door answered.
              if (isOwnEcho(String(payload?.eventType ?? ""), row, keptLedger)) return;
              changed();
            },
          },
        ],
        onBackfill: backfill,
      });
      const notices = manager.open({
        topic: commentNoticeChannel.topic({ entityType: sourceToken, entityId: sourceId }),
        // Authorized by RLS on realtime.messages; the package awaits setAuth() before joining.
        // realtime-admission: comments
        private: true,
        // The sender is Postgres: no Matrx envelope, so echo suppression is done here, by the ids
        // this tab deleted (echo.ts ledger).
        wire: { mode: "raw" },
        // Every notice carries its own id (gen_random_uuid() in platform._comments_announce_delete).
        eventKey: (_source, payload) => ((payload ?? {}) as CommentNotice).id,
        broadcast: [
          { event: "comment.deleted", onMessage: (m) => onCommentNotice(keptLedger, m, changed) },
          { event: "comment.restored", onMessage: (m) => onCommentNotice(keptLedger, m, changed) },
        ],
        onBackfill: backfill,
      });
      return () => {
        comments.close();
        notices.close();
      };
    });
  }, [manager, sourceKey, sourceId, sourceToken]);

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
        input.onWritten?.(id);
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

  /**
   * Discard a draft that did not save — RECONCILED with the server (verify RC-B11 round 2, finding
   * 2): an attempt whose answer was lost may have landed, and a discard that only forgets the
   * draft brings it back on the next reload. The landed row is found by the draft's own client
   * request id and removed the platform's way (soft delete); a row that never landed is fine.
   * Returns a sentence when the server could not be asked (the draft stays, nothing is lost).
   */
  const discardDraft = useCallback(
    async (key: string): Promise<string | null> => {
      const draft = drafts.find((d) => d.key === key);
      const src = sourceRef.current;
      try {
        if (draft && src && draft.clientRequestId) {
          if (draft.kind === "highlight" || draft.kind === "note") {
            // The highlight's document id IS its client request id (content.annotation_create p_id).
            await deleteHighlight(draft.clientRequestId).catch((e: unknown) => {
              if (!(e instanceof WriteDidNotLandError)) throw e; // nothing landed — nothing to remove
            });
          } else if (draft.kind === "comment" || draft.kind === "suggestion") {
            const { items } = await listCommentThreads(src);
            const landed = items.find((i) => i.clientRequestId === draft.clientRequestId && i.commentId);
            if (landed?.commentId) {
              ledger.current.deletedIds.add(landed.commentId);
              await deleteComment(landed.commentId);
            }
          }
        }
        if (draft?.kind === "link" && src && draft.link) {
          await unlinkRecord(src, draft.link.token, draft.link.id).catch(() => undefined);
        }
      } catch (e) {
        return `We couldn't check whether this was already saved, so it was kept. ${message(e)}`;
      }
      setDrafts((d) => d.filter((x) => x.key !== key));
      await reload();
      return null;
    },
    [drafts, reload],
  );

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
      if (!canEdit) return "Only someone who can edit this document can accept a suggestion, so it was not applied.";
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
    [reload, canEdit],
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

  // What the association vocabulary lets a reader file on this kind (Highlight / Link absent otherwise).
  const [pairs, setPairs] = useState<{ token: string; highlights: boolean; links: boolean } | null>(null);
  const token = source?.token ?? null;
  useEffect(() => {
    if (!token) return;
    let stale = false;
    annotationPairs(token)
      .then((p) => {
        if (!stale) setPairs({ token, ...p });
      })
      .catch((e: unknown) => {
        if (!stale) setPairsError(message(e));
      });
    return () => {
      stale = true;
    };
  }, [token]);
  const pairsHere = pairs && pairs.token === token ? pairs : null;

  const capabilities: SidecarCapabilities = {
    anchoredWrites: ANCHOR_WRITES_ENABLED,
    collaborationDoors: doors,
    highlights: !!pairsHere?.highlights,
    links: !!(source && tryGetEntityInfo(source.token)) && !!pairsHere?.links,
    paint: typeof CSS !== "undefined" && "highlights" in CSS,
    canEdit,
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
    // Rejecting keeps the suggestion (resolved, under "Show resolved") — archive, never delete.
    rejectSuggestion: (commentId: string) => act(() => resolveComment(commentId, true)),
    editComment: editMine,
    deleteComment: (commentId: string) =>
      act(async () => {
        ledger.current.deletedIds.add(commentId);
        await deleteComment(commentId);
      }),
    resolveComment: (commentId: string, resolved: boolean) => act(() => resolveComment(commentId, resolved)),
    saveNote: (documentId: string, note: string) => act(() => saveHighlightNote(documentId, note)),
    removeHighlight: (documentId: string) => act(() => deleteHighlight(documentId)),
    /** Undo a removal (the toast's Undo): the same door /trash's Restore uses. */
    restoreHighlight: (documentId: string) => act(() => restoreHighlight(documentId)),
    restoreComment: (commentId: string) =>
      act(async () => {
        ledger.current.deletedIds.delete(commentId);
        await restoreComment(commentId);
      }),
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
