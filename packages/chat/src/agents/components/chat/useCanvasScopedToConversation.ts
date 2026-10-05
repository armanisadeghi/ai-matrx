"use client";

/**
 * Canvas tabs about one conversation do not follow the person into another.
 *
 * The canvas is the shell's one right-hand region and it remembers its tabs, so
 * a tab that is ABOUT a chat (its Documents, a comment thread on one of its
 * answers) used to stay open after "New chat about this" — showing the previous
 * chat's thread beside the new one. Scope is declared by the tab's data:
 *
 *  - `data.conversationId` — the tab belongs to that conversation; or
 *  - `data.entity === "message"` + `data.id` — the tab is about that message, and
 *    the conversation is wherever the store has the message.
 *
 * A tab whose conversation is KNOWN and is not the one now on screen closes. A
 * comment-thread tab that names no chat (legacy) closes too; any other unknown
 * tab stays. Threads opened while the chat is on screen are stamped with it, so
 * they survive their own reload and never follow the person into another chat.
 * Runs when a chat surface mounts or its conversation changes.
 */

import { useEffect } from "react";
import { useStore } from "react-redux";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { selectCanvasIsHydrated, type CanvasItem, type CanvasItemId, type CanvasJson } from "@ai-matrx/canvas";

export type MessageConversationLookup = (messageId: string) => string | null;

/** The conversation a tab is about, or null when its data does not say. */
export function canvasItemConversation(
  item: Pick<CanvasItem, "data">,
  conversationOfMessage: MessageConversationLookup,
): string | null {
  const data = item.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.conversationId === "string" && record.conversationId) return record.conversationId;
  if (record.entity === "message" && typeof record.id === "string" && record.id) {
    return conversationOfMessage(record.id);
  }
  return null;
}

/** The kind id of a record's comment-thread tab (features/rich-document/annotations/canvas/commentThreadKind.ts). */
const COMMENT_THREAD_KIND = "comment-thread";

/**
 * Ids of the open tabs a chat on screen must not carry: tabs that belong to a
 * conversation other than `conversationId`, and — a comment thread is always
 * opened FROM some chat — thread tabs that name no chat at all (legacy tabs
 * from before they were stamped, restored from a past session).
 */
export function tabsOfOtherConversations(
  items: Record<string, CanvasItem>,
  conversationId: string,
  conversationOfMessage: MessageConversationLookup,
): CanvasItemId[] {
  return Object.values(items)
    .filter((item) => {
      const owner = canvasItemConversation(item, conversationOfMessage);
      if (owner === null) return item.kind === COMMENT_THREAD_KIND;
      return owner !== conversationId;
    })
    .map((item) => item.id);
}

/** Thread tabs opened while this chat is on screen that name no chat yet: they are this chat's. */
export function unownedThreadTabs(
  items: Record<string, CanvasItem>,
  conversationOfMessage: MessageConversationLookup,
): CanvasItem[] {
  return Object.values(items).filter(
    (item) => item.kind === COMMENT_THREAD_KIND && canvasItemConversation(item, conversationOfMessage) === null,
  );
}

type MessagesSlice = { messages?: { byConversationId?: Record<string, { byId?: Record<string, unknown> } | undefined> } };

export function useCanvasScopedToConversation(conversationId: string): void {
  const canvas = useOptionalCanvas();
  const store = useStore<MessagesSlice>();
  useEffect(() => {
    if (!canvas || !conversationId) return undefined;
    const lookup: MessageConversationLookup = (messageId) => {
      const byConversation = store.getState().messages?.byConversationId ?? {};
      for (const [owner, slice] of Object.entries(byConversation)) {
        if (slice?.byId && messageId in slice.byId) return owner;
      }
      return null;
    };
    // The saved tabs come back from storage a moment after mount: judge them once,
    // when they have, and from then on every thread opened here belongs to this chat.
    let swept = false;
    const run = () => {
      const state = canvas.getState();
      if (!selectCanvasIsHydrated(state)) return;
      if (!swept) {
        swept = true;
        for (const id of tabsOfOtherConversations(state.items, conversationId, lookup)) canvas.close(id);
        return;
      }
      for (const item of unownedThreadTabs(state.items, lookup)) {
        const data = item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : {};
        canvas.update(item.id, { data: { ...(data as Record<string, CanvasJson>), conversationId } });
      }
    };
    run();
    return canvas.store.subscribe(run);
  }, [canvas, conversationId, store]);
}
