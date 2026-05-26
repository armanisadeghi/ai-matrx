"use client";

import React, { useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { closeMessaging } from "@/features/messaging/redux/messagingSlice";
import { ConversationList } from "@/features/messaging/components/ConversationList";
import { MessagesHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { MessageSquare } from "lucide-react";

export default function MessagesPage() {
  const dispatch = useAppDispatch();

  // Get user from Redux - use auth.users.id (UUID)
  const user = useAppSelector(selectUser);
  const userId = user?.id;

  // Close side sheet on mount (using full page view)
  useEffect(() => {
    dispatch(closeMessaging());
  }, [dispatch]);

  return (
    <>
      {/* Header injected into main layout */}
      <MessagesHeader title="Messages" />

      {/* Mobile: Full-screen conversation list */}
      <div className="md:hidden flex flex-col h-full">
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
          <h1 className="text-lg font-semibold">Messages</h1>
        </div>
        <ConversationList userId={userId} className="flex-1" />
      </div>

      {/* Desktop: Empty state (sidebar shows list, this is the default content) */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-zinc-400" />
        </div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-1">
          Select a conversation
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
          Choose a conversation from the list or start a new one to begin messaging
        </p>
      </div>
    </>
  );
}
