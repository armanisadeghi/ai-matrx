"use client";

/**
 * Authenticated-only client island for `/messages`. The parent layout decides
 * whether to render this or the marketing `<MessagesLanding />` from the SSR
 * auth state — a guest never loads any of this.
 *
 * On a phone this IS the list. On desktop the list lives in the layout's
 * sidebar and this is the "pick a conversation" pane.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeMessaging } from "@/features/messaging/redux/messagingUiSlice";
import { ConversationListPane } from "@/features/messaging/components/ConversationListPane";
import { MessagesListHeader } from "@/features/messaging/components/shell/MessagesListHeader";
import { useMessagesSurfaceScope } from "@/features/messaging/lib/useMessagesSurfaceScope";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

export default function MessagesPageClient() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const getScope = useMessagesSurfaceScope();

  // The side sheet and the full page are the same conversations; leaving the
  // sheet open behind the page would be two views of one thread.
  useEffect(() => {
    dispatch(closeMessaging());
  }, [dispatch]);

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/messages"
      getScope={getScope}
      isEditable={false}
    >
      <MessagesListHeader />

      {/* Mobile: full-screen conversation list (the desktop sidebar is hidden) */}
      <div className="flex h-full flex-col pt-[var(--shell-header-h)] md:hidden">
        <ConversationListPane
          className="flex-1"
          onSelect={(conversationId) => router.push(`/messages/${conversationId}`)}
          getApplicationScope={getScope}
        />
      </div>

      {/* Desktop: the sidebar has the list, so this is the default content */}
      <div className="hidden h-full flex-1 flex-col items-center justify-center p-8 text-center md:flex">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="mb-1 text-lg font-medium text-foreground">
          Select a conversation
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Choose a conversation from the list or start a new one to begin
          messaging
        </p>
      </div>
    </SurfaceRuntimeProvider>
  );
}
