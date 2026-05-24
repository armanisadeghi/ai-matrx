"use client";

// ChatSidebarMenu — conversation history for the `/chat` Large Route, rendered
// INSIDE the app shell sidebar (registered in `route-menu-registry`). Mirrors
// AgentRunSidebarMenu: the shell owns the chrome, the switch button, and the
// "local menu ⇄ main app menu" toggle. It auto-switches to this menu on the
// chat route. Controls (agent picker, new chat) live in the shell header via
// `ChatRunHeader`, NOT here.

import { useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { PinnedAgentsSection } from "./PinnedAgentsSection";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

const CHAT_HISTORY_SCOPE = "chat-route";

/** Derive the active conversation + active agent from the chat URL. */
function parseChatPath(pathname: string): {
  activeConversationId: string | null;
  activeAgentId: string | undefined;
} {
  // /chat/a/[agentId]
  const agentMatch = pathname.match(/^\/chat\/a\/([^/]+)/);
  if (agentMatch) {
    return {
      activeConversationId: null,
      activeAgentId: decodeURIComponent(agentMatch[1]),
    };
  }
  // /chat/[conversationId] — but NOT /chat/new
  const convMatch = pathname.match(/^\/chat\/([^/]+)$/);
  if (convMatch && convMatch[1] !== "new") {
    return { activeConversationId: convMatch[1], activeAgentId: undefined };
  }
  return { activeConversationId: null, activeAgentId: undefined };
}

interface ChatSidebarMenuProps {
  expanded: boolean;
}

export default function ChatSidebarMenu({ expanded }: ChatSidebarMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeConversationId, activeAgentId } = parseChatPath(pathname);

  const openConversation = useCallback(
    (conv: ConversationListItem) => router.push(`/chat/${conv.conversationId}`),
    [router],
  );
  const selectPinnedAgent = useCallback(
    (agentId: string) => router.push(`/chat/a/${encodeURIComponent(agentId)}`),
    [router],
  );

  // Collapsed rail: history is hidden; expanding the sidebar reveals it.
  // (Matches the chat's prior behavior — no icon-only history rail.)
  if (!expanded) return null;

  return (
    <ChatHistorySidebar
      scopeId={CHAT_HISTORY_SCOPE}
      activeConversationId={activeConversationId}
      onOpenConversation={openConversation}
      topSlot={
        <PinnedAgentsSection
          activeAgentId={activeAgentId}
          onSelect={selectPinnedAgent}
        />
      }
      // `flex-1 min-h-0` (matching AgentRunSidebarMenu) lets the inner list's
      // `overflow-y-auto` actually scroll inside the shell's flex sidebar /
      // mobile drawer instead of overflowing it.
      className="bg-transparent min-h-0 flex-1"
    />
  );
}
