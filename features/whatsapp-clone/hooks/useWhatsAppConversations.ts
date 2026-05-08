"use client";

import { useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectConversations,
  selectMessagingIsLoading,
  selectMessagingError,
} from "@/features/messaging/redux/messagingSlice";
import type { ConversationWithDetails } from "@/features/messaging/types";
import { getMockConversations } from "../mock-data/conversations";
import type { WAConversation } from "../types";
import { useWhatsAppDataMode } from "./WhatsAppDataModeProvider";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export interface UseWhatsAppConversationsReturn {
  conversations: WAConversation[];
  selectedId: string | null;
  select: (id: string | null) => void;
  isLoading: boolean;
  error: string | null;
}

function adaptConversation(
  c: ConversationWithDetails,
  selfUserId: string | null,
): WAConversation {
  const lastMsg = c.last_message;
  const lastIsOwn =
    !!lastMsg && !!selfUserId && lastMsg.sender_id === selfUserId;
  const otherParticipant = c.participants?.find(
    (p) => p.user_id !== selfUserId,
  );
  return {
    id: c.id,
    name: c.display_name ?? c.group_name ?? "Conversation",
    avatarUrl: c.display_image ?? c.group_image_url ?? null,
    isGroup: c.type === "group",
    participants: (c.participants ?? []).map((p) => ({
      id: p.user_id,
      name: p.user?.display_name ?? p.user?.email ?? "Unknown",
      avatarUrl: p.user?.avatar_url ?? null,
    })),
    lastMessagePreview: lastMsg?.content ?? "",
    lastMessageAt: lastMsg?.created_at ?? c.updated_at,
    lastMessageStatus: lastMsg?.status,
    lastMessageIsOwn: lastIsOwn,
    unreadCount: c.unread_count ?? 0,
    online: false,
  };
}

export function useWhatsAppConversations(): UseWhatsAppConversationsReturn {
  const { mode } = useWhatsAppDataMode();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const liveConversations = useAppSelector(selectConversations);
  const liveIsLoading = useAppSelector(selectMessagingIsLoading);
  const liveError = useAppSelector(selectMessagingError);
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

  const adapted = liveConversations.map((c) =>
    adaptConversation(c, selfUserId),
  );

  return {
    conversations: adapted,
    selectedId,
    select: setSelectedId,
    isLoading: liveIsLoading,
    error: liveError,
  };
}
