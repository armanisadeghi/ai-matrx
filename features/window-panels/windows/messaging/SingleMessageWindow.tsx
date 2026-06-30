"use client";

import React, { useCallback, useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { selectConversations } from "@/features/messaging/redux/messagingSlice";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ChatThread } from "@/features/messaging/components/ChatThread";

interface SingleMessageWindowProps {
  isOpen: boolean;
  onClose?: () => void;
  instanceId?: string;
  conversationId?: string | null;
}

export default function SingleMessageWindow({
  isOpen,
  onClose,
  instanceId,
  conversationId,
}: SingleMessageWindowProps) {
  const user = useAppSelector(selectUser);
  const userId = user?.id;
  const displayName =
    user?.userMetadata?.fullName ||
    user?.userMetadata?.name ||
    user?.email?.split("@")[0] ||
    "User";

  // Resolve title from the cached conversation list (may be undefined until
  // MessagingInitializer has loaded the participant list).
  const conversations = useAppSelector(selectConversations);
  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  );
  const title = conversation?.display_name ?? "Conversation";

  const collectData = useCallback(
    () => ({ conversationId: conversationId ?? null }),
    [conversationId],
  );

  if (!isOpen || !conversationId) return null;

  return (
    <WindowPanel
      id={instanceId}
      title={title}
      width={520}
      height={620}
      minWidth={360}
      minHeight={320}
      onClose={onClose}
      overlayId="singleMessageWindow"
      onCollectData={collectData}
    >
      <ChatThread
        conversationId={conversationId}
        userId={userId ?? undefined}
        displayName={displayName}
        className="h-full"
      />
    </WindowPanel>
  );
}
