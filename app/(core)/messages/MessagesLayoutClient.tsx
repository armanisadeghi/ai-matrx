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

export default function MessagesLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get user from Redux - use auth.users.id (UUID)
  const user = useAppSelector(selectUser);
  const userId = user?.id ?? undefined;

  return (
    <div className="flex h-full overflow-y-auto overflow-x-hidden bg-background">
      {/* Desktop Sidebar - Persistent Conversation List */}
      <div className="hidden md:flex md:w-80 flex-col border-r border-border shrink-0 pt-[var(--shell-header-h)]">
        <ConversationList userId={userId} className="flex-1" />
      </div>

      {/* Main Content Area - Route Outlet */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
