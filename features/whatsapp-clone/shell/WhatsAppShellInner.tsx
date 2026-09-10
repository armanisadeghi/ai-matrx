"use client";

import { useState } from "react";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useOverlayActions } from "@/features/window-panels/hooks/useOverlay";
import { IconRail, type RailKey } from "./IconRail";
import { PaneDivider } from "./PaneDivider";
import { ConversationListPane } from "../conversation-list/ConversationListPane";
import { ChatViewPane } from "../chat-view/ChatViewPane";
import { useWhatsAppConversations } from "../hooks/useWhatsAppConversations";
import { NewConversationDialog } from "@/features/messaging/components/NewConversationDialog";

interface WhatsAppShellInnerProps {
  userName?: string;
  userAvatarUrl?: string | null;
  /**
   * When true, renders without the custom TitleBar (used inside a WindowPanel
   * which provides its own chrome). Default: false (standalone shell renders
   * its own traffic-light bar via the parent component).
   */
  hideTitleBar?: boolean;
}

/**
 * The pure body of the WhatsApp shell: icon rail + conversation list + chat
 * view in a 3-pane resizable layout. Used directly by the original demo and
 * inside the WhatsAppShellWindow for the windowed demo.
 *
 * Settings and Media open via the global overlay system
 * (useOverlayActions().open("whatsappSettings" | "whatsappMedia")), so this
 * component does not own modal state.
 */
export function WhatsAppShellInner({
  userName,
  userAvatarUrl,
}: WhatsAppShellInnerProps) {
  const [activeRail, setActiveRail] = useState<RailKey>("chats");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const {
    conversations,
    selectedId,
    select,
    archiveFilter,
    setArchiveFilter,
    archivedCount,
  } = useWhatsAppConversations();
  const { open } = useOverlayActions();
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const unreadChats = conversations.reduce(
    (s, c) => s + (c.unreadCount || 0),
    0,
  );

  const openSettings = () =>
    open("whatsappSettings", { data: { userName, userAvatarUrl } });
  const openMedia = () => open("whatsappMedia", {});

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <IconRail
          active={activeRail}
          onSelect={setActiveRail}
          onSettings={openSettings}
          onOpenMedia={openMedia}
          unreadChats={unreadChats}
          userName={userName}
          userAvatarUrl={userAvatarUrl}
        />
        <ResizablePanelGroup
          orientation="horizontal"
          id="wa-shell-split"
          className="flex-1"
        >
          <ResizablePanel
            id="wa-list"
            defaultSize="32%"
            minSize="22%"
            maxSize="50%"
          >
            <ConversationListPane
              conversations={conversations}
              selectedId={selectedId}
              onSelect={select}
              onNewChat={() => setNewChatOpen(true)}
              archiveFilter={archiveFilter}
              onArchiveFilterChange={setArchiveFilter}
              archivedCount={archivedCount}
            />
          </ResizablePanel>
          <PaneDivider />
          <ResizablePanel id="wa-chat" defaultSize="68%" minSize="40%">
            <ChatViewPane conversation={selected} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <NewConversationDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onCreated={(id) => {
          setNewChatOpen(false);
          select(id);
        }}
      />
    </div>
  );
}
