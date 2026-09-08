"use client";

/**
 * One conversation in its own floating window — the same `<ConversationPane>`
 * the route and the docked sheet render.
 */

import React, { useCallback } from "react";
import { useConversations } from "@ai-matrx/messaging/react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ConversationPane } from "@/features/messaging/components/ConversationPane";
import { useMessagesSurfaceScope } from "@/features/messaging/lib/useMessagesSurfaceScope";

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
  const { conversations } = useConversations();
  const getScope = useMessagesSurfaceScope(conversationId ?? undefined);

  // The title comes from the inbox the engine already holds; before the first
  // read it is honestly generic rather than blank.
  const conversation =
    conversations.find((item) => item.conversation.id === conversationId) ?? null;

  const collectData = useCallback(
    () => ({ conversationId: conversationId ?? null }),
    [conversationId],
  );

  if (!isOpen || !conversationId) return null;

  return (
    <WindowPanel
      id={instanceId}
      title={conversation?.displayName ?? "Conversation"}
      width={520}
      height={620}
      minWidth={360}
      minHeight={320}
      onClose={onClose}
      overlayId="singleMessageWindow"
      overlayInstanceId={instanceId}
      onCollectData={collectData}
    >
      <ConversationPane
        conversationId={conversationId}
        className="h-full"
        getApplicationScope={getScope}
      />
    </WindowPanel>
  );
}
