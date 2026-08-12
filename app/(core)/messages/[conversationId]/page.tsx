"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  closeMessaging,
  setCurrentConversation,
  markConversationAsRead,
  selectConversations,
  selectTotalUnreadCount,
} from "@/features/messaging/redux/messagingSlice";
import { ChatThread } from "@/features/messaging/components/ChatThread";
import { MessagesThreadHeader } from "@/features/messaging/components/shell/MessagesThreadHeader";
import { useOnlinePresence } from "@/hooks/useSupabaseMessaging";
import { getMessagingService } from "@/lib/supabase/messaging";
import { createMessagesScope } from "@/features/surfaces/manifests/messages.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

export default function ConversationPage() {
  const params = useParams();
  const dispatch = useAppDispatch();
  const conversationId = params.conversationId as string;
  const markAsReadCalledRef = useRef(false);

  // Loaded-message count, published up from ChatThread (which owns the useChat
  // subscription). A ref, not state: `getScope` is sampled when the user presses
  // Run, so this must be the live value and must not re-render the thread.
  const loadedMessageCountRef = useRef(0);
  const handleLoadedMessageCountChange = useCallback((count: number) => {
    loadedMessageCountRef.current = count;
  }, []);

  // Get user from Redux - use auth.users.id (UUID)
  const user = useAppSelector(selectUser);
  const userId = user?.id ?? undefined;
  const displayName = useMemo(
    () =>
      user?.userMetadata?.fullName ||
      user?.userMetadata?.name ||
      user?.email?.split("@")[0] ||
      "User",
    [user?.userMetadata?.fullName, user?.userMetadata?.name, user?.email],
  );

  // Get conversations from Redux (centralized state)
  const conversations = useAppSelector(selectConversations);
  const totalUnreadCount = useAppSelector(selectTotalUnreadCount);
  const currentConversation = conversations.find(
    (c) => c.id === conversationId,
  );

  // Get online presence for header
  const { onlineUsers } = useOnlinePresence(
    conversationId,
    userId || null,
    displayName,
  );

  // For direct chats, check if the other user is online
  const otherParticipant =
    currentConversation?.type === "direct"
      ? currentConversation.participants?.find((p) => p.user_id !== userId)
      : null;

  const isOtherUserOnline = otherParticipant
    ? onlineUsers.some((u) => u.user_id === otherParticipant.user_id)
    : undefined;

  // Close side sheet and set current conversation on mount
  // Also eagerly mark conversation as read in both Redux AND the database
  useEffect(() => {
    dispatch(closeMessaging());
    dispatch(setCurrentConversation(conversationId));

    // Immediately clear unread in Redux (redundant with setCurrentConversation but explicit)
    dispatch(markConversationAsRead(conversationId));

    // Eagerly mark as read in the database -- don't wait for messages to load
    // This ensures the DB state is consistent even if the user navigates away quickly
    if (userId && !markAsReadCalledRef.current) {
      markAsReadCalledRef.current = true;
      getMessagingService()
        .markConversationAsRead(conversationId, userId)
        .catch(() => {
          // Non-critical -- swallow errors
        });
    }

    // Clear current conversation when leaving
    return () => {
      dispatch(setCurrentConversation(null));
      markAsReadCalledRef.current = false;
    };
  }, [dispatch, conversationId, userId]);

  const getScope = () => {
    const last = currentConversation?.last_message;
    return createMessagesScope({
      current_conversation_id: conversationId,
      current_conversation_message_count: loadedMessageCountRef.current,
      current_conversation_title:
        currentConversation?.display_name ??
        currentConversation?.group_name ??
        undefined,
      current_sender_id: last?.sender_id ?? undefined,
      current_sender_name: last?.sender?.display_name ?? undefined,
      last_message_text: last?.content ?? undefined,
      last_message_timestamp: last?.created_at ?? undefined,
      total_unread_count: totalUnreadCount,
      all_conversations: conversations.map((c) => ({
        id: c.id,
        title: c.display_name ?? c.group_name ?? null,
        unread_count: c.unread_count ?? 0,
        last_message_at: c.updated_at,
      })),
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/messages"
      getScope={getScope}
      isEditable={false}
    >
      {/* Header injected into the shell's header center zone */}
      <MessagesThreadHeader
        title={currentConversation?.display_name || "Chat"}
        avatarUrl={currentConversation?.display_image}
        isOnline={
          currentConversation?.type === "direct" ? isOtherUserOnline : undefined
        }
      />

      {/* Chat Thread - Full height */}
      <div className="h-full flex flex-col overflow-hidden bg-background">
        <ChatThread
          conversationId={conversationId}
          userId={userId}
          displayName={displayName}
          className="flex-1"
          onLoadedMessageCountChange={handleLoadedMessageCountChange}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}
