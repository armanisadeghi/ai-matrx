"use client";

/**
 * The WhatsApp demo skin's thread. Live mode is `@ai-matrx/messaging`'s engine
 * — the same optimistic send, outbox, dedup and typing lease the real surface
 * gets; this file only reshapes rows for the skin's components.
 */

import { useMemo } from "react";
import {
  useComposer,
  useConversation,
  useMessagingHost,
  useTypists,
} from "@ai-matrx/messaging/react";
import {
  asConversationId,
  type Attachment,
  type Message,
} from "@ai-matrx/messaging";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getMockMessages } from "../mock-data/messages";
import type { WAMessage } from "../types";
import { useWhatsAppDataMode } from "./WhatsAppDataModeProvider";

/** A file the skin already uploaded through the app's file handler. */
export interface WhatsAppAttachment {
  kind: "image" | "video" | "audio" | "file";
  attachment: Attachment;
}

export interface UseWhatsAppChatReturn {
  messages: WAMessage[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  typingText: string | null;
  sendMessage: (content: string, media?: WhatsAppAttachment) => Promise<void>;
  loadMore: () => Promise<void>;
}

function adaptMessage(message: Message, selfUserId: string | null): WAMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    type: message.kind as WAMessage["type"],
    content: message.content,
    authorId: message.senderId,
    isOwn: selfUserId !== null && message.senderId === selfUserId,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    status: message.deliveryState as WAMessage["status"],
    // A DURABLE file id is the identity — the package drops a signed-URL-only
    // attachment rather than rendering a link that will 403 later.
    media:
      message.attachments.length > 0
        ? {
            fileId: message.attachments[0]?.fileId,
            fileName: message.attachments[0]?.fileName ?? undefined,
            fileSize: message.attachments[0]?.sizeBytes ?? undefined,
            mimeType: message.attachments[0]?.mimeType ?? undefined,
          }
        : null,
    systemKind: message.kind === "system" ? "encryption" : undefined,
  };
}

export function useWhatsAppChat(
  conversationId: string | null,
): UseWhatsAppChatReturn {
  const { mode } = useWhatsAppDataMode();
  const selfUserId = useAppSelector(selectUserId);
  const liveId =
    mode === "live" && conversationId !== null
      ? asConversationId(conversationId)
      : null;

  const host = useMessagingHost();
  const conversation = useConversation(liveId);
  const composer = useComposer(liveId);
  const typists = useTypists(liveId, conversation.participants);

  const liveMessages = useMemo(
    () => conversation.messages.map((message) => adaptMessage(message, selfUserId)),
    [conversation.messages, selfUserId],
  );

  if (mode === "mock") {
    const mocks = conversationId ? getMockMessages(conversationId) : [];
    return {
      messages: mocks,
      isLoading: false,
      isSending: false,
      error: null,
      typingText: null,
      sendMessage: async () => {},
      loadMore: async () => {},
    };
  }

  return {
    messages: liveMessages,
    isLoading: conversation.isLoading,
    // A queued message is ON SCREEN as an optimistic bubble the instant it is
    // typed, so "sending" is a property of a message, never of the surface.
    isSending: false,
    error: null,
    typingText: typists.label,
    sendMessage: async (content, media) => {
      if (media !== undefined) {
        // Media rides the engine directly: the composer is for typed text, and
        // the attachment is already a durable ref the app's file handler minted.
        if (liveId === null) return;
        host?.engine.send({
          conversationId: liveId,
          content,
          kind: media.kind,
          attachments: [media.attachment],
        });
        return;
      }
      composer.setValue(content);
      composer.send();
    },
    loadMore: async () => {
      conversation.loadOlder();
    },
  };
}
