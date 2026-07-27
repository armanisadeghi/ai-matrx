"use client";

import { useState, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AgentConfig } from "../context/DEPRECATED-ChatContext";

// ============================================================================
// TYPES
// ============================================================================

export interface ChatSidebarProps {
  activeRequestId?: string | null;
  onSelectChat: (requestId: string) => void;
  onNewChat: () => void;
  onAgentSelect?: (agent: AgentConfig) => void;
  /** Opens the unified agent picker (bottom sheet / dialog) */
  onOpenAgentPicker?: () => void;
  selectedAgent?: AgentConfig | null;
  /** Controlled open state (lifted from parent for mobile header coordination) */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

// ============================================================================
// LAZY-LOADED SECTIONS (ssr: false — zero impact on initial page load)
// ============================================================================

// FRAGMENTATION LAW: the four sidebar parts always render together in one
// column — they are statically ONE piece here; the single ssr:false boundary
// lives in the ChatSidebar front door (./ChatSidebar.tsx).
import SidebarAgentHeader from "./sidebar/SidebarAgentHeader";
import SidebarAgents from "./sidebar/SidebarAgents";
import SidebarChats from "./sidebar/SidebarChats";
import SidebarUserFooter from "./sidebar/SidebarUserFooter";

// ============================================================================
// CHAT SIDEBAR SHELL
// ============================================================================

export function ChatSidebarImpl({
  activeRequestId,
  onSelectChat,
  onNewChat,
  onAgentSelect,
  onOpenAgentPicker,
  selectedAgent,
  isOpen,
  onOpenChange,
  className = "",
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const isMobile = useIsMobile();

  const toggleSidebar = useCallback(() => {
    onOpenChange(!isOpen);
  }, [isOpen, onOpenChange]);

  const closeSidebar = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Only close the sidebar when a conversation is selected on mobile (overlay mode).
  // On desktop the sidebar is a persistent in-flow panel and should stay open.
  const closeSidebarOnSelect = useCallback(() => {
    if (isMobile) onOpenChange(false);
  }, [isMobile, onOpenChange]);

  const handleNewChat = useCallback(() => {
    onNewChat();
    closeSidebar();
  }, [onNewChat, closeSidebar]);

  // Shared sidebar content rendered inside both mobile and desktop panels
  const sidebarContent = (
    <div className="h-full flex flex-col">
      {/* Section 0: Top controls — collapse, new chat, agent picker */}
      <SidebarAgentHeader onCollapse={closeSidebar} />

      {/* Scrollable middle: Agents + Chats together */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {/* Section 2: Agents — direct selection (already shows full list) */}
        <SidebarAgents
          selectedAgent={selectedAgent}
          onAgentSelect={onAgentSelect}
          searchQuery={searchQuery}
        />

        {/* Section 3: Chats */}
        <SidebarChats
          activeRequestId={activeRequestId}
          onSelectChat={onSelectChat}
          onNewChat={onNewChat}
          searchQuery={searchQuery}
          onCloseSidebar={closeSidebarOnSelect}
        />
      </div>

      {/* Section 4: User Footer — pinned to bottom */}
      <SidebarUserFooter />
    </div>
  );

  return (
    <>
      {/* ── Mobile overlay backdrop (mobile only) ── */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeSidebar}
      />

      {/* ── Mobile drawer ── */}
      <div
        className={`fixed left-0 top-0 bottom-0 w-[272px] z-40 bg-card border-r border-border shadow-xl md:hidden transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {sidebarContent}
      </div>

      {/* ── Desktop sidebar — in-flow, displaces content ── */}
      <div
        className={`hidden md:flex flex-shrink-0 h-full bg-card border-r border-border transition-[width] duration-300 ease-in-out overflow-hidden ${
          isOpen ? "w-[256px]" : "w-0"
        }`}
      >
        <div className="w-[256px] h-full flex-shrink-0">{sidebarContent}</div>
      </div>
    </>
  );
}

export default ChatSidebarImpl;
