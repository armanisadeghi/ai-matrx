"use client";

/**
 * The floating Messages window — the SAME panes the /messages route renders
 * (A PANEL WRAPS THE CANONICAL COMPONENT). Nothing about a conversation is
 * drawn twice in this repo.
 */

import React, { useCallback, useEffect, useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { asConversationId } from "@ai-matrx/messaging";
import { useConversations, useMessagingHost, useMessagingSnapshot } from "@ai-matrx/messaging/react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ConversationListPane } from "@/features/messaging/components/ConversationListPane";
import { ConversationPane } from "@/features/messaging/components/ConversationPane";
import { NewConversationDialog } from "@/features/messaging/components/NewConversationDialog";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { MESSAGES_SURFACE_NAME } from "@/features/messaging/lib/messaging-menu-actions";
import { useMessagesSurfaceScope } from "@/features/messaging/lib/useMessagesSurfaceScope";
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
  const host = useMessagingHost();
  const snapshot = useMessagingSnapshot();
  const { conversations } = useConversations();

  const activeConversationId = snapshot?.activeConversationId ?? null;
  const activeConversation =
    conversations.find((item) => item.conversation.id === activeConversationId) ?? null;
  const getScope = useMessagesSurfaceScope(activeConversationId ?? undefined);

  // Hoisted at the window root (composition-root pattern): the sidebar's "+"
  // button AND the empty state's menu item drive the SAME dialog instance.
  const [newConversationOpen, setNewConversationOpen] = useState(false);

  // Honor a seeded conversationId once on open.
  useEffect(() => {
    if (host === null) return;
    if (conversationId && conversationId !== activeConversationId) {
      void host.engine.openConversation(asConversationId(conversationId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, host]);

  const handleSelect = useCallback(
    (id: string) => {
      void host?.engine.openConversation(asConversationId(id));
    },
    [host],
  );

  const collectData = useCallback(
    () => ({ conversationId: activeConversationId ?? null }),
    [activeConversationId],
  );

  // Window-level extra section, DENSITY LAW: labels only. The one action the
  // empty state makes obvious — copy/export/AI already come from the core menu.
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
        activeConversation
          ? `Messages — ${activeConversation.displayName}`
          : "Messages"
      }
      width={900}
      height={640}
      minWidth={520}
      minHeight={360}
      sidebar={
        <ConversationListPane
          className="h-full"
          onSelect={handleSelect}
          onNewConversation={() => setNewConversationOpen(true)}
          getApplicationScope={getScope}
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
      <NewConversationDialog
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        onCreated={handleSelect}
      />
      {activeConversationId ? (
        <ConversationPane
          conversationId={activeConversationId}
          className="h-full"
          getApplicationScope={getScope}
        />
      ) : (
        /*
          🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). The populated
          panes carry theirs; this empty state is body chrome that belongs to
          the WINDOW — without a menu here a right-click is answered by whatever
          page happens to be underneath, handing the user THAT page's surface
          and agents.
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
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <MessageSquare className="h-7 w-7 text-zinc-400" />
            </div>
            <h2 className="mb-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
              Select a conversation
            </h2>
            <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
              Pick a conversation from the list, or start a new one to begin
              messaging.
            </p>
          </div>
        </NonEditableContextMenu>
      )}
    </WindowPanel>
  );
}
