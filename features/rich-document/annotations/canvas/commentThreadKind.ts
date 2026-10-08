"use client";

/**
 * A record's comment threads as a canvas tab (`comment-thread`), keyed by the
 * record (`entity:id`), focused on one root comment when asked.
 *
 * This is where the desktop "Notes & comments" panel lives now (Arman,
 * 2026-10-03: threads open in THE CANVAS — the right-hand region is the
 * canvas, never a second floating panel). Two bodies, one tab:
 *
 *  - LIVE: the record is rendered on this page with its reading set
 *    (`RecordAnnotations`). The page keeps the sidecar — anchors, paint,
 *    the selection toolbar — and portals its `AnnotationPanel` into this tab's
 *    slot (the `page-panel` seam, keyed by the thing instead of the moment).
 *  - STANDALONE: the record is not on this page (a receipt link, a restored
 *    tab after a reload). The tab shows the record's canonical `CommentThread`
 *    over the same `cmt_*` rows, so the tab always comes back.
 *
 * Light: registers at boot; the body loads only when a tab renders.
 */

import { MessagesSquare } from "lucide-react";
import { useSyncExternalStore } from "react";
import { canvasItemId, type CanvasController, type CanvasItemId, type CanvasOpenInput } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { openCanvasItem } from "@/features/canvas/host/openCanvasItem";
import { openDockFor } from "../record-annotations-store";

export const COMMENT_THREAD_KIND = "comment-thread";

export type CommentThreadData = {
  /** Entity-type token of the commented record (`message`, `note`, `task`, …). */
  entity: string;
  id: string;
  /** Tab title. */
  title: string;
  /** The root comment to bring forward (a reply's id resolves to its root's card). */
  focus: string | null;
  /** The chat this thread is about (a message's thread) — the tab closes when another chat is on screen. */
  conversationId?: string | null;
};

export function commentThreadKey(entity: string, id: string): string {
  return `${entity}:${id}`;
}

export function commentThreadItemId(entity: string, id: string): CanvasItemId {
  return canvasItemId(COMMENT_THREAD_KIND, commentThreadKey(entity, id));
}

export function commentThreadOpenInput(data: CommentThreadData): CanvasOpenInput {
  return { kind: COMMENT_THREAD_KIND, key: commentThreadKey(data.entity, data.id), title: data.title, data };
}

export function readCommentThreadData(data: unknown): CommentThreadData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { entity, id, title, focus, conversationId } = data as Record<string, unknown>;
  if (typeof entity !== "string" || !entity || typeof id !== "string" || !id) return null;
  return {
    entity,
    id,
    title: typeof title === "string" && title ? title : "Comments",
    focus: typeof focus === "string" && focus ? focus : null,
    ...(typeof conversationId === "string" && conversationId ? { conversationId } : {}),
  };
}

/**
 * THE way anything opens a record's threads: the canvas tab, and — when the
 * record is rendered on this page — its own reading set fills the tab, so
 * passages stay painted and every panel action works.
 */
export function openCommentThread(
  canvas: CanvasController | null,
  input: { entity: string; id: string; title?: string | null; focus?: string | null; conversationId?: string | null },
): CanvasItemId | null {
  const opened = openCanvasItem(
    canvas,
    commentThreadOpenInput({
      entity: input.entity,
      id: input.id,
      title: input.title || "Comments",
      focus: input.focus ?? null,
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    }),
  );
  if (opened) openDockFor(commentThreadKey(input.entity, input.id));
  return opened;
}

// ── live slots: the page's panel portals into the tab ───────────────────────

const STORE = Symbol.for("ai-matrx.host.canvas.comment-thread-slots");

interface SlotStore {
  /** item id → the tab body's DOM slot. */
  slots: Map<string, HTMLElement>;
  /** item id → how many live page mounts hold it. */
  holders: Map<string, number>;
  listeners: Set<() => void>;
}

function store(): SlotStore {
  const g = globalThis as unknown as { [STORE]?: SlotStore };
  g[STORE] ??= { slots: new Map(), holders: new Map(), listeners: new Set() };
  return g[STORE];
}

function emit() {
  for (const listener of [...store().listeners]) listener();
}

function subscribe(listener: () => void) {
  store().listeners.add(listener);
  return () => store().listeners.delete(listener);
}

export function setCommentThreadSlot(itemId: string, element: HTMLElement | null) {
  const slots = store().slots;
  if (element) {
    if (slots.get(itemId) === element) return;
    slots.set(itemId, element);
  } else if (!slots.delete(itemId)) {
    return;
  }
  emit();
}

/** A live page mount fills this tab while it holds it. Returns the release. */
export function holdCommentThread(itemId: string): () => void {
  const holders = store().holders;
  holders.set(itemId, (holders.get(itemId) ?? 0) + 1);
  emit();
  return () => {
    const next = (holders.get(itemId) ?? 1) - 1;
    if (next <= 0) holders.delete(itemId);
    else holders.set(itemId, next);
    emit();
  };
}

export function useCommentThreadSlot(itemId: string): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => store().slots.get(itemId) ?? null, () => null);
}

export function useCommentThreadHeld(itemId: string): boolean {
  return useSyncExternalStore(subscribe, () => store().holders.has(itemId), () => false);
}

export const COMMENT_THREAD_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<CommentThreadData>({
  id: COMMENT_THREAD_KIND,
  surface: "dom",
  label: "Comments",
  icon: MessagesSquare,
  load: () => import("./CommentThreadCanvasView"),
  title: (data) => data.title,
  restore: true,
});
