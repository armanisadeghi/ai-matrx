"use client";

/**
 * Messages Layout Client
 *
 * Provides shared layout for messaging routes:
 * - Desktop: Persistent sidebar with conversation list
 * - Mobile: Full-screen routes (sidebar hidden)
 *
 * The main authenticated layout already includes MessagingInitializer.
 * Each page injects its own shell header via <PageHeader> (see
 * features/messaging/components/shell/); the sidebar carries no title of
 * its own and gets `pt-[var(--shell-header-h)]` so its search/"New" toolbar
 * clears the transparent glass header.
 */

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { ConversationList } from "@/features/messaging/components/ConversationList";
import {
  selectConversations,
  selectTotalUnreadCount,
} from "@/features/messaging/redux/messagingSlice";
import { createMessagesScope } from "@/features/surfaces/manifests/messages.manifest";

export default function MessagesLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get user from Redux - use auth.users.id (UUID)
  const user = useAppSelector(selectUser);
  const userId = user?.id ?? undefined;
  const conversations = useAppSelector(selectConversations);
  const totalUnreadCount = useAppSelector(selectTotalUnreadCount);

  const getScope = () =>
    createMessagesScope({
      total_unread_count: totalUnreadCount,
      all_conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.display_name ?? conversation.group_name ?? null,
        unread_count: conversation.unread_count ?? 0,
        last_message_at: conversation.updated_at,
      })),
    });

  return (
    <div className="flex h-full min-h-0 overflow-y-auto overflow-x-hidden bg-background">
      {/* Desktop Sidebar - Persistent Conversation List */}
      <div className="hidden min-h-0 shrink-0 flex-col border-r border-border pt-[var(--shell-header-h)] md:flex md:w-80">
        <ConversationList
          userId={userId}
          className="min-h-0 flex-1"
          getApplicationScope={getScope}
        />
      </div>

      {/* Main Content Area - Route Outlet */}
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
