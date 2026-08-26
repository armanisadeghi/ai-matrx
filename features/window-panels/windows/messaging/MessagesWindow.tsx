"use client";

import React, { useCallback, useEffect, useState } from "react";
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
import { MessageSquare, Plus } from "lucide-react";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { MESSAGES_SURFACE_NAME } from "@/features/messaging/lib/messaging-menu-actions";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";

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

  // Hoisted at the window root (composition-root pattern): both the sidebar's
  // own "+" button AND the body empty-state's context-menu item drive the
  // SAME dialog instance, rather than each owning a separate one.
  const [newConversationOpen, setNewConversationOpen] = useState(false);

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

  // Window-level extra section, DENSITY LAW: labels only. The one action the
  // empty state makes obvious — everything else (copy/export/AI) already
  // comes from the core menu acting on the resolved placeholder content.
  const emptyStateSection: ContextMenuExtraSection = {
    id: "messages-empty",
    label: "Messages",
    icon: Plus,
    items: [
      {
        kind: "item",
        id: "messages-new-conversation",
        label: "New conversation…",
        icon: Plus,
        onSelect: () => setNewConversationOpen(true),
      },
    ],
  };

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
          newConversationOpen={newConversationOpen}
          onNewConversationOpenChange={setNewConversationOpen}
        />
      }
      sidebarDefaultSize={280}
      sidebarMinSize={220}
      sidebarClassName="bg-muted/10 border-r"
      urlSyncKey="messages"
      urlSyncId={activeConversationId ?? ""}
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
        /*
          🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). The two
          populated panes carry theirs (`ConversationList` / `ChatThread`), but
          this empty state is body chrome that belongs to the WINDOW — without
          a menu here a right-click was answered by whatever page happened to
          be underneath, handing the user THAT page's surface and agents.
        */
        <NonEditableContextMenu
          sourceFeature="messages"
          surfaceName={MESSAGES_SURFACE_NAME}
          contentSource={{ type: "raw" }}
          contextData={{
            content:
              "Messages — no conversation is open. Pick one from the list on the left, or start a new one.",
          }}
          // No `entity`: nothing is selected, so there is no record for
          // Attach To / Share to target — correctly absent, not missing.
          extraSections={[emptyStateSection]}
        >
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
        </NonEditableContextMenu>
      )}
    </WindowPanel>
  );
}
