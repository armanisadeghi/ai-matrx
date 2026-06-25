"use client";

/**
 * ChatHistorySidebar — the user-facing /chat conversation sidebar.
 *
 * This is now a THIN WRAPPER around the canonical
 * `ConversationHistorySidebar` (`variant="consumer"`). The rendering +
 * data pipeline live in that one primitive so the consumer (/chat) and dense
 * (/code, agent apps) lists never drift. This wrapper exists only to:
 *  - keep the `ChatHistorySidebar` import stable for existing callers
 *    (ChatSidebarMenu, QuickChatSheet),
 *  - default the surface to `"chat"` (so it opens showing real chats only,
 *    with the source-filter tree to reach everything else),
 *  - map the legacy consumer prop names onto the primitive.
 *
 * New surfaces should use `ConversationHistorySidebar` directly.
 */

import React from "react";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

export interface ChatHistorySidebarProps {
  /** Unique scope key — shares fetched state across mounts with the same id. */
  scopeId: string;
  /** Active conversation (highlights the row). */
  activeConversationId?: string | null;
  /** Called when a row is clicked. */
  onOpenConversation?: (conv: ConversationListItem) => void;
  /**
   * Open the clicked conversation IN PLACE via `onOpenConversation` instead of
   * routing the page to `/chat/<id>`. For drawers / embedded panels that host
   * the conversation themselves. Default false (the standalone /chat route).
   */
  openInPlace?: boolean;
  /** Optional header rendered above the list (toggle + picker + new chat). */
  headerSlot?: React.ReactNode;
  /** Optional surface rendered between header and list (e.g. pinned agents). */
  topSlot?: React.ReactNode;
  /**
   * Filterable-surface id driving the default source filter + filter tree.
   * Defaults to `"chat"` — real chats only, everything else behind the tree.
   */
  surfaceId?: string;
  /**
   * @deprecated Legacy DENY-list on `source_feature`. Prefer `surfaceId`
   * (ALLOW-list). Still honored and AND-ed with the surface filter.
   */
  excludeSourceFeatures?: string[];
  /** Start with the search field open and focused. */
  initialSearchOpen?: boolean;
  /** Suppress the built-in inline "Search chats" affordance. */
  hideSearchAffordance?: boolean;
  className?: string;
}

export function ChatHistorySidebar({
  scopeId,
  activeConversationId,
  onOpenConversation,
  openInPlace = false,
  headerSlot,
  topSlot,
  surfaceId = "chat",
  excludeSourceFeatures,
  initialSearchOpen = false,
  hideSearchAffordance = false,
  className,
}: ChatHistorySidebarProps) {
  return (
    <ConversationHistorySidebar
      variant="consumer"
      scopeId={scopeId}
      agentIds={[]}
      surfaceId={surfaceId}
      activeConversationId={activeConversationId}
      onOpenConversation={onOpenConversation}
      openInPlace={openInPlace}
      headerSlot={headerSlot}
      topSlot={topSlot}
      excludeSourceFeatures={excludeSourceFeatures}
      initialSearchOpen={initialSearchOpen}
      hideSearchAffordance={hideSearchAffordance}
      className={className}
    />
  );
}

export default ChatHistorySidebar;
