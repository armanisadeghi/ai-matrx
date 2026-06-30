"use client";

import React, { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  selectCurrentConversationId,
  selectCurrentConversation,
  setCurrentConversation,
} from "@/features/messaging/redux/messagingSlice";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ConversationList } from "@/features/messaging/components/ConversationList";
import { ChatThread } from "@/features/messaging/components/ChatThread";
import { MessageSquare } from "lucide-react";

interface MessagesWindowProps {
  isOpen: boolean;
  onClose?: () => void;
  conversationId?: string | null;
}

export default function MessagesWindow({
  isOpen,
  onClose,
  conversationId,
}: MessagesWindowProps) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const userId = user?.id;
  const displayName =
    user?.userMetadata?.fullName ||
    user?.userMetadata?.name ||
    user?.email?.split("@")[0] ||
    "User";

  const activeConversationId = useAppSelector(selectCurrentConversationId);
  const activeConversation = useAppSelector(selectCurrentConversation);

  // Honor seeded conversationId once on open.
  useEffect(() => {
    if (conversationId && conversationId !== activeConversationId) {
      dispatch(setCurrentConversation(conversationId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleSelect = useCallback(
    (id: string) => {
      dispatch(setCurrentConversation(id));
    },
    [dispatch],
  );

  const collectData = useCallback(
    () => ({
      conversationId: activeConversationId ?? null,
    }),
    [activeConversationId],
  );

  if (!isOpen) return null;

  return (
    <WindowPanel
      title={
        activeConversation?.display_name
          ? `Messages — ${activeConversation.display_name}`
          : "Messages"
      }
      width={900}
      height={640}
      minWidth={520}
      minHeight={360}
      sidebar={
        <ConversationList
          userId={userId ?? undefined}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelect}
          className="h-full"
        />
      }
      sidebarDefaultSize={280}
      sidebarMinSize={220}
      sidebarClassName="bg-muted/10 border-r"
      urlSyncKey="messages"
      onClose={onClose}
      overlayId="messagesWindow"
      onCollectData={collectData}
    >
      {activeConversationId ? (
        <ChatThread
          conversationId={activeConversationId}
          userId={userId ?? undefined}
          displayName={displayName}
          className="h-full"
        />
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-center p-8">
          <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
            <MessageSquare className="w-7 h-7 text-zinc-400" />
          </div>
          <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-1">
            Select a conversation
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">
            Pick a conversation from the list, or start a new one to begin
            messaging.
          </p>
        </div>
      )}
    </WindowPanel>
  );
}
