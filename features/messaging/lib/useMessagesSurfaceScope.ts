"use client";

/**
 * The `matrx-user/messages` surface scope, read from the ONE messaging store.
 *
 * Every messaging surface publishes the same shape, so it is built in one place
 * rather than copied into four routes and drifting. The returned function is
 * SAMPLED when the user presses Run — so it reads the store at that moment
 * rather than closing over a render's snapshot.
 */

import { useCallback } from "react";
import { useMessagingHost } from "@ai-matrx/messaging/react";
import { summarizeText } from "@ai-matrx/messaging";
import {
  createMessagesScope,
  type MessagesScopeValues,
} from "@/features/surfaces/manifests/messages.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

export function useMessagesSurfaceScope(
  conversationId?: string,
): () => SurfaceScopePayload {
  const host = useMessagingHost();

  return useCallback(() => {
    const snapshot = host?.engine.store.snapshot();
    const conversations = snapshot?.conversations ?? [];
    const current =
      conversationId !== undefined
        ? (conversations.find(
            (item) => item.conversation.id === conversationId,
          ) ?? null)
        : null;
    const thread =
      conversationId !== undefined
        ? (snapshot?.threads.get(conversationId as never) ?? null)
        : null;
    const lastSender = current?.participants.find(
      (participant) => participant.userId === current.lastMessageSenderId,
    );

    const values: MessagesScopeValues = {
      total_unread_count: snapshot?.totalUnreadConversations ?? 0,
      all_conversations: conversations.map((item) => ({
        id: item.conversation.id,
        title: item.displayName,
        unread_count: item.unreadCount,
        last_message_at: item.lastMessageAt,
      })),
      ...(conversationId !== undefined
        ? { current_conversation_id: conversationId }
        : {}),
      ...(current !== null
        ? {
            current_conversation_title: current.displayName,
            // A ```matrx fence never reaches an agent's scope as JSON, for the
            // same reason it never reaches a notification as JSON.
            last_message_text: summarizeText(current.lastMessageContent ?? ""),
            ...(current.lastMessageAt !== null
              ? { last_message_timestamp: current.lastMessageAt }
              : {}),
            ...(current.lastMessageSenderId !== null
              ? { current_sender_id: current.lastMessageSenderId }
              : {}),
            ...(lastSender !== undefined
              ? { current_sender_name: lastSender.displayName }
              : {}),
          }
        : {}),
      ...(thread !== null
        ? { current_conversation_message_count: thread.messages.length }
        : {}),
    };
    return createMessagesScope(values);
  }, [host, conversationId]);
}
