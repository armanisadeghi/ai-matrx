"use client";

/**
 * The WhatsApp demo skin's conversation list.
 *
 * "live" mode reads the ONE messaging store through `@ai-matrx/messaging`'s
 * hooks — the same engine the real /messages route uses, so this demo is a
 * different SKIN over the same data, never a second data layer.
 */

import { useState } from "react";
import { useConversations } from "@ai-matrx/messaging/react";
import type { ConversationSummary } from "@ai-matrx/messaging";
import { summarizeText } from "@ai-matrx/messaging";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getMockConversations } from "../mock-data/conversations";
import type { WAConversation } from "../types";
import { useWhatsAppDataMode } from "./WhatsAppDataModeProvider";

export interface UseWhatsAppConversationsReturn {
  conversations: WAConversation[];
  selectedId: string | null;
  select: (id: string | null) => void;
  isLoading: boolean;
  error: string | null;
}

function adaptConversation(
  summary: ConversationSummary,
  selfUserId: string | null,
): WAConversation {
  return {
    id: summary.conversation.id,
    name: summary.displayName,
    avatarUrl: summary.displayImageUrl,
    isGroup: summary.conversation.type === "group",
    participants: summary.participants.map((participant) => ({
      id: participant.userId,
      name: participant.displayName || participant.email || "Unknown",
      avatarUrl: participant.avatarUrl,
    })),
    // A ```matrx fence collapses to its human label in a preview, never JSON.
    lastMessagePreview: summarizeText(summary.lastMessageContent ?? "", 90),
    lastMessageAt: summary.lastMessageAt ?? summary.conversation.updatedAt,
    lastMessageIsOwn:
      selfUserId !== null && summary.lastMessageSenderId === selfUserId,
    unreadCount: summary.unreadCount,
    // THE ARCHIVED-ITEMS LAW: the viewer's own `is_archived` flag on the
    // participant row. The engine already projects it; nothing read it, so an
    // archived thread sat unlabelled among the active ones.
    isArchived: summary.isArchived,
    isMuted: summary.isMuted,
    online: false,
  };
}

export function useWhatsAppConversations(): UseWhatsAppConversationsReturn {
  const { mode } = useWhatsAppDataMode();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { conversations, isInitialLoading } = useConversations();
  const selfUserId = useAppSelector(selectUserId);

  if (mode === "mock") {
    return {
      conversations: getMockConversations(),
      selectedId,
      select: setSelectedId,
      isLoading: false,
      error: null,
    };
  }

  return {
    conversations: conversations.map((item) =>
      adaptConversation(item, selfUserId),
    ),
    selectedId,
    select: setSelectedId,
    isLoading: isInitialLoading,
    // Failures are reported through the provider's diagnostic sink (a toast
    // with a remedy), not mirrored into every surface's own error string.
    error: null,
  };
}
