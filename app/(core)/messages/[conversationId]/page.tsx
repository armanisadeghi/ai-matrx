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
import { useConversation } from "@ai-matrx/messaging/react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeMessaging } from "@/features/messaging/redux/messagingUiSlice";
import { ConversationPane } from "@/features/messaging/components/ConversationPane";
import { MessagesThreadHeader } from "@/features/messaging/components/shell/MessagesThreadHeader";
import { useMessagesSurfaceScope } from "@/features/messaging/lib/useMessagesSurfaceScope";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const conversationId = params.conversationId as string;
  const id = asConversationId(conversationId);

  const getScope = useMessagesSurfaceScope(conversationId);

  // Opens the thread and its channel, and keeps them open while this route is
  // mounted. The read receipt rides it — no separate "mark as read" call, and
  // no chance of marking a conversation read that never opened.
  const thread = useConversation(id);
  useEffect(() => {
    dispatch(closeMessaging());
  }, [dispatch]);

  // A conversation that does not exist or that this person cannot read is an
  // access question, never "No messages yet" and never an endless spinner.
  // `error.cause` is the raw database error (42501 / PGRST116) the gate
  // classifies; the gate then asks the platform which case it really is.
  if (thread.unavailable) {
    return (
      <AccessGate
        token="dm_conversation"
        id={conversationId}
        error={thread.error?.cause ?? thread.error}
        fallbackHref="/messages"
        fallbackLabel="All messages"
      />
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/messages"
      getScope={getScope}
      isEditable={false}
    >
      {/* Header injected into the shell's header center zone */}
      <MessagesThreadHeader />

      <div className="flex h-full flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
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
