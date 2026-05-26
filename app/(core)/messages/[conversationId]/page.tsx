"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  closeMessaging,
  setCurrentConversation,
  markConversationAsRead,
  selectConversations,
} from "@/features/messaging/redux/messagingSlice";
import { ChatThread } from "@/features/messaging/components/ChatThread";
import { MessagesHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { useOnlinePresence } from "@/hooks/useSupabaseMessaging";
import { getMessagingService } from "@/lib/supabase/messaging";

export default function ConversationPage() {
  const params = useParams();
  const dispatch = useAppDispatch();
  const conversationId = params.conversationId as string;
  const markAsReadCalledRef = useRef(false);

  // Get user from Redux - use auth.users.id (UUID)
  const user = useAppSelector(selectUser);
  const userId = user?.id;
  const displayName = useMemo(() =>
    user?.userMetadata?.fullName ||
    user?.userMetadata?.name ||
    user?.email?.split("@")[0] ||
    "User",
    [user?.userMetadata?.fullName, user?.userMetadata?.name, user?.email]
  );

  // Get conversations from Redux (centralized state)
  const conversations = useAppSelector(selectConversations);
  const currentConversation = conversations.find((c) => c.id === conversationId);

  // Get online presence for header
  const { onlineUsers } = useOnlinePresence(conversationId, userId || null, displayName);
  
  // For direct chats, check if the other user is online
  const otherParticipant = currentConversation?.type === "direct"
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

  return (
    <>
      {/* Header injected into main layout */}
      <MessagesHeader 
        title={currentConversation?.display_name || "Chat"}
        showBack
        backHref="/messages"
        avatarUrl={currentConversation?.display_image}
        isOnline={currentConversation?.type === "direct" ? isOtherUserOnline : undefined}
      />
      
      {/* Chat Thread - Full height */}
      <div className="h-full flex flex-col overflow-hidden bg-background">
        <ChatThread
          conversationId={conversationId}
          userId={userId}
          displayName={displayName}
          className="flex-1"
        />
      </div>
    </>
  );
}
