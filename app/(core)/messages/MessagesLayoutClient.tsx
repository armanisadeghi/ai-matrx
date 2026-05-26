"use client";

/**
 * Messages Layout Client
 * 
 * Provides shared layout for messaging routes:
 * - Desktop: Persistent sidebar with conversation list
 * - Mobile: Full-screen routes (sidebar hidden)
 * 
 * The main authenticated layout already includes MessagingInitializer.
 */

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { ConversationList } from "@/features/messaging/components/ConversationList";

export default function MessagesLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get user from Redux - use auth.users.id (UUID)
  const user = useAppSelector(selectUser);
  const userId = user?.id;

  return (
    <div className="h-[calc(100dvh-var(--shell-header-h))] flex overflow-hidden bg-background">
      {/* Desktop Sidebar - Persistent Conversation List */}
      <div className="hidden md:flex md:w-80 flex-col border-r border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
          <h1 className="text-lg font-semibold">Messages</h1>
        </div>
        <ConversationList userId={userId} className="flex-1" />
      </div>

      {/* Main Content Area - Route Outlet */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
