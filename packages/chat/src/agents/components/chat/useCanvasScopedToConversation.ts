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
 * A tab whose conversation is KNOWN and is not the one now on screen closes.
 * An unknown one stays (a restored tab whose chat is not loaded is not ours to
 * judge). Runs when a chat surface mounts or its conversation changes.
 */

import { useEffect } from "react";
import { useStore } from "react-redux";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import type { CanvasItem, CanvasItemId } from "@ai-matrx/canvas";

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

/** Ids of the open tabs that belong to a conversation other than `conversationId`. */
export function tabsOfOtherConversations(
  items: Record<string, CanvasItem>,
  conversationId: string,
  conversationOfMessage: MessageConversationLookup,
): CanvasItemId[] {
  return Object.values(items)
    .filter((item) => {
      const owner = canvasItemConversation(item, conversationOfMessage);
      return owner !== null && owner !== conversationId;
    })
    .map((item) => item.id);
}

type MessagesSlice = { messages?: { byConversationId?: Record<string, { byId?: Record<string, unknown> } | undefined> } };

export function useCanvasScopedToConversation(conversationId: string): void {
  const canvas = useOptionalCanvas();
  const store = useStore<MessagesSlice>();
  useEffect(() => {
    if (!canvas || !conversationId) return;
    const lookup: MessageConversationLookup = (messageId) => {
      const byConversation = store.getState().messages?.byConversationId ?? {};
      for (const [owner, slice] of Object.entries(byConversation)) {
        if (slice?.byId && messageId in slice.byId) return owner;
      }
      return null;
    };
    for (const id of tabsOfOtherConversations(canvas.getState().items, conversationId, lookup)) {
      canvas.close(id);
    }
  }, [canvas, conversationId, store]);
}
