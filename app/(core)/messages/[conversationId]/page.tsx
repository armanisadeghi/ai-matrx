"use client";

/**
 * One conversation, full page.
 *
 * Opening it, subscribing to it, backfilling it after a reconnect, marking it
 * read and clearing its badge are all `@ai-matrx/messaging`'s — `useConversation`
 * opens the conversation channel on mount and closes it when this route stops
 * caring. This file is the app frame: the shell header, the surface scope, and
 * the right-click menu that `<ConversationPane>` carries.
 */

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { asConversationId } from "@ai-matrx/messaging";
import {
  useConversation,
  useConversations,
  useOnlineUserIds,
} from "@ai-matrx/messaging/react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { closeMessaging } from "@/features/messaging/redux/messagingUiSlice";
import { ConversationPane } from "@/features/messaging/components/ConversationPane";
import { MessagesThreadHeader } from "@/features/messaging/components/shell/MessagesThreadHeader";
import { useMessagesSurfaceScope } from "@/features/messaging/lib/useMessagesSurfaceScope";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const conversationId = params.conversationId as string;
  const id = asConversationId(conversationId);

  const userId = useAppSelector(selectUserId);
  const getScope = useMessagesSurfaceScope(conversationId);

  // Opens the thread and its channel, and keeps them open while this route is
  // mounted. The read receipt rides it — no separate "mark as read" call, and
  // no chance of marking a conversation read that never opened.
  useConversation(id);
  const { conversations } = useConversations();
  const online = useOnlineUserIds(id);

  const conversation =
    conversations.find((item) => item.conversation.id === conversationId) ?? null;
  const otherParticipant =
    conversation?.conversation.kind === "direct"
      ? (conversation.participants.find(
          (participant) => participant.userId !== userId,
        ) ?? null)
      : null;

  useEffect(() => {
    dispatch(closeMessaging());
  }, [dispatch]);

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/messages"
      getScope={getScope}
      isEditable={false}
    >
      {/* Header injected into the shell's header center zone */}
      <MessagesThreadHeader
        title={conversation?.displayName ?? "Chat"}
        avatarUrl={conversation?.displayImageUrl ?? undefined}
        isOnline={
          otherParticipant !== null
            ? online.has(otherParticipant.userId)
            : undefined
        }
      />

      <div className="flex h-full flex-col overflow-hidden bg-background">
        <ConversationPane
          conversationId={conversationId}
          className="flex-1"
          onBack={() => router.push("/messages")}
          getApplicationScope={getScope}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}
