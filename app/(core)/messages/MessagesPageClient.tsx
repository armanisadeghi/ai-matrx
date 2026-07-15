"use client";

import { useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  closeMessaging,
  selectConversations,
  selectTotalUnreadCount,
} from "@/features/messaging/redux/messagingSlice";
import { ConversationList } from "@/features/messaging/components/ConversationList";
import { MessagesListHeader } from "@/features/messaging/components/shell/MessagesListHeader";
import { MessageSquare } from "lucide-react";
import { createMessagesScope } from "@/features/surfaces/manifests/messages.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

/**
 * Authenticated-only client island for `/messages`. The parent page
 * (server component) decides whether to render this or the marketing
 * `<MessagesLanding />` based on the SSR auth state — guests never load
 * any of the Redux / messaging code below.
 */
export default function MessagesPageClient() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const userId = user?.id ?? undefined;
  const conversations = useAppSelector(selectConversations);
  const totalUnreadCount = useAppSelector(selectTotalUnreadCount);

  useEffect(() => {
    dispatch(closeMessaging());
  }, [dispatch]);

  const getScope = () =>
    createMessagesScope({
      total_unread_count: totalUnreadCount,
      all_conversations: conversations.map((c) => ({
        id: c.id,
        title: c.display_name ?? c.group_name ?? null,
        unread_count: c.unread_count ?? 0,
        last_message_at: c.updated_at,
      })),
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/messages"
      surfaceLabel="Messages"
      getScope={getScope}
      isEditable={false}
    >
      <MessagesListHeader />

      {/* Mobile: Full-screen conversation list (desktop sidebar is hidden) */}
      <div className="md:hidden flex flex-col h-full pt-[var(--shell-header-h)]">
        <ConversationList userId={userId} className="flex-1" />
      </div>

      {/* Desktop: Empty state (sidebar shows list, this is the default content) */}
      <div className="hidden md:flex flex-1 h-full flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-zinc-400" />
        </div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-1">
          Select a conversation
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
          Choose a conversation from the list or start a new one to begin
          messaging
        </p>
      </div>
    </SurfaceRuntimeProvider>
  );
}
