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
  HighlightLinkError,
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

/** An own-author event this soon after THIS tab wrote is its echo. */
const OWN_ECHO_WINDOW_MS = 5000;

const commentsChannel = defineChannelNamespace({
  namespace: "annotation-sidecar-comments",
  parts: ["entityId"],
  description: "platform.comments changes on one annotated source (RC-B11 sidecar)",
});

function message(e: unknown): string {
  // The write path resolves the organization (ensureOrgId); a refusal for want of one is said in
  // words with its remedy, never as the transport's error text.
  if (isOrganizationRequiredError(e)) return organizationRefusalMessage({ act: "saved", subject: "This annotation" });
  return e instanceof Error ? e.message : String(e);
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

  // Live comments from everyone who can read the source.
  const lastLocalWrite = useRef(0);
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
              onChange: ({ row }) => {
                // THIS TAB's own writes already reload after the door answers:
                // never pay twice. Scoped to this tab's recent writes, so the
                // same person's OTHER tab still updates live.
                const by = row && typeof row === "object" ? (row as { updated_by?: unknown }).updated_by : undefined;
                if (by && by === getUserId() && Date.now() - lastLocalWrite.current < OWN_ECHO_WINDOW_MS) return;
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
      setDrafts((d) => [...d.filter((x) => x.key !== draft.key), { ...draft, saveState: "pending", error: undefined }]);
      lastLocalWrite.current = Date.now();
      try {
        await write();
        setDrafts((d) => d.filter((x) => x.key !== draft.key));
        await reload();
        return true;
      } catch (e) {
        const extra: Partial<AnnotationItem> =
          e instanceof HighlightLinkError ? { annotationDocumentId: e.documentId } : {};
        setDrafts((d) =>
          d.map((x) => (x.key === draft.key ? { ...x, ...extra, saveState: "failed", error: message(e) } : x)),
        );
        return false;
      }
    },
    [reload],
  );

  const me = () => ({ id: getUserId(), name: "You" });
  const now = () => new Date().toISOString();

  const postComment = useCallback(
    async (input: CommentDraft & { parentId?: string | null }): Promise<MentionNoticeResult | null> => {
      const src = sourceRef.current;
      if (!src) return null;
      let notice: MentionNoticeResult | null = null;
      if (input.parentId) {
        // Replies are written straight through (no passage, nothing to paint).
        lastLocalWrite.current = Date.now();
        const id = await addComment({ source: src, body: input.body, parentId: input.parentId });
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
      };
      await runDraft(draft, async () => {
        const id = await addComment({
          source: src,
          body: input.body,
          anchor: input.anchor,
          suggestedText: input.suggestedText ?? null,
        });
        const mentions = mentionedUserIds(input.body);
        if (mentions.length && doors) notice = await notifyMentions(id, mentions, src.href);
      });
      return notice;
    },
    [doors, reload, runDraft],
  );

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
      };
      return runDraft(draft, async () => {
        await createHighlight({
          source: src,
          anchor: draft.anchor,
          color: draft.color ?? color,
          note: draft.body,
          existingDocumentId: draft.annotationDocumentId ?? null,
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
      return runDraft(item, async () => {
        await addComment({ source: src, body: item.body, anchor: item.anchor, suggestedText: item.suggestedText ?? null });
      });
    },
    [addHighlight, runDraft],
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
      lastLocalWrite.current = Date.now();
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

  const capabilities: SidecarCapabilities = {
    anchoredWrites: ANCHOR_WRITES_ENABLED,
    collaborationDoors: doors,
    paint: typeof CSS !== "undefined" && "highlights" in CSS,
  };

  return {
    state: { items, loading, error, capabilities } satisfies SidecarState,
    reload,
    postComment,
    addHighlight,
    link,
    retry,
    discardDraft,
    acceptSuggestion,
    rejectSuggestion: (commentId: string) => act(() => deleteComment(commentId)),
    editComment: (commentId: string, body: string) => act(() => editComment(commentId, body)),
    deleteComment: (commentId: string) => act(() => deleteComment(commentId)),
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
