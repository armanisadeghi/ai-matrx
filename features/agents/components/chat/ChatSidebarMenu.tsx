"use client";

// ChatSidebarMenu — conversation history for the `/chat` Large Route, rendered
// INSIDE the app shell sidebar (registered in `route-menu-registry`). Mirrors
// AgentRunSidebarMenu: the shell owns the chrome, the switch button, and the
// "local menu ⇄ main app menu" toggle. It auto-switches to this menu on the
// chat route. Controls (agent picker, new chat) live in the shell header via
// `ChatRunHeader`, NOT here.
//
// Two render modes, driven by the shell's `expanded` flag:
//   - expanded: the full ChatHistorySidebar (pinned agents + grouped history).
//   - collapsed: an icon rail offering the SAME core actions the header gives —
//     new chat, search chats, search agents — so the narrow rail is useful, not
//     dead space. Search uses portaled popovers (the sidebar is overflow:hidden,
//     so inline expansion can't escape it).

import { useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Search, Webhook } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { PinnedAgentsSection } from "./PinnedAgentsSection";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

const CHAT_HISTORY_SCOPE = "chat-route";

/** Shared styling for the collapsed-rail icon buttons. */
const RAIL_BTN_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground " +
  "transition-colors hover:bg-accent hover:text-foreground shell-tactile-subtle";

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
  const [chatSearchOpen, setChatSearchOpen] = useState(false);

  const openConversation = useCallback(
    (conv: ConversationListItem) => router.push(`/chat/${conv.conversationId}`),
    [router],
  );
  const selectPinnedAgent = useCallback(
    (agentId: string) => router.push(`/chat/a/${encodeURIComponent(agentId)}`),
    [router],
  );
  // `+` starts a NEW conversation with the ACTIVE agent (the agent route always
  // mints a fresh one). No active agent → the default greeting landing. Matches
  // ChatRunHeader's handleNewChat so the rail and the header behave identically.
  const handleNewChat = useCallback(() => {
    if (activeAgentId) {
      router.push(`/chat/a/${encodeURIComponent(activeAgentId)}`);
    } else {
      router.push("/chat/new");
    }
  }, [router, activeAgentId]);

  // ── Collapsed rail — icon actions mirroring the header (new / find chat /
  //    find agent). Popovers are portaled, so they escape the rail's overflow.
  if (!expanded) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <button
          type="button"
          onClick={handleNewChat}
          className={RAIL_BTN_CLASS}
          title="New chat"
          aria-label="New chat"
        >
          <Plus className="h-[18px] w-[18px]" />
        </button>

        <Popover open={chatSearchOpen} onOpenChange={setChatSearchOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={RAIL_BTN_CLASS}
              title="Search chats"
              aria-label="Search chats"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="w-80 overflow-hidden p-0"
          >
            <div className="flex h-[min(70vh,560px)] flex-col">
              <ChatHistorySidebar
                scopeId={CHAT_HISTORY_SCOPE}
                activeConversationId={activeConversationId}
                onOpenConversation={(conv) => {
                  openConversation(conv);
                  setChatSearchOpen(false);
                }}
                initialSearchOpen
                className="h-full"
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Agent search reuses the canonical AgentListDropdown (search built in)
            via its triggerSlot — no parallel agent-picker. */}
        <AgentListDropdown
          onSelect={selectPinnedAgent}
          contentSide="right"
          triggerSlot={
            <button
              type="button"
              className={RAIL_BTN_CLASS}
              title="Search agents"
              aria-label="Search agents"
            >
              {/* Webhook mirrors the app's "Agents" nav icon for a consistent
                  visual language (Bot is banned as an AI-cliché glyph). */}
              <Webhook className="h-[18px] w-[18px]" />
            </button>
          }
        />
      </div>
    );
  }

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
