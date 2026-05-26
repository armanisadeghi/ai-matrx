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
import { Mic, Plus, Search, Webhook } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { PinnedAgentsSection } from "./PinnedAgentsSection";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

const CHAT_HISTORY_SCOPE = "chat-route";

/**
 * `cx_conversation.source_feature` values to hide from the chat history.
 * Voice transcripts (xAI Realtime) live in `cx_conversation` too but can't
 * be replayed in the text-chat view, so they're filtered out here. A future
 * voice-history surface will load them via its own scope.
 */
const CHAT_HISTORY_EXCLUDE: ReadonlyArray<string> = ["voice-agent"];

/** Voice agent route — both the rail icon and the expanded shortcut link here. */
const VOICE_AGENT_HREF = "/chat/voice";

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
  const isVoiceRoute = pathname.startsWith(VOICE_AGENT_HREF);
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
  const openVoiceAgent = useCallback(() => {
    router.push(VOICE_AGENT_HREF);
  }, [router]);

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

        {/* Subtle divider — voice is a different MODE, not another shortcut to
            the same text-chat surface, so we visually separate it. */}
        <div
          aria-hidden="true"
          className="my-1 h-px w-5 bg-border/60"
        />

        <button
          type="button"
          onClick={openVoiceAgent}
          className={cn(
            RAIL_BTN_CLASS,
            isVoiceRoute && "bg-accent text-foreground",
          )}
          title="Voice agent"
          aria-label="Voice agent"
          aria-current={isVoiceRoute ? "page" : undefined}
        >
          <Mic className="h-[18px] w-[18px]" />
        </button>
      </div>
    );
  }

  return (
    <ChatHistorySidebar
      scopeId={CHAT_HISTORY_SCOPE}
      activeConversationId={activeConversationId}
      onOpenConversation={openConversation}
      // Voice transcripts can't be replayed in the text-chat view — filter
      // them out at the query so they never enter this scope's list.
      excludeSourceFeatures={CHAT_HISTORY_EXCLUDE as string[]}
      topSlot={
        <>
          <VoiceAgentShortcut
            active={isVoiceRoute}
            onClick={openVoiceAgent}
          />
          <PinnedAgentsSection
            activeAgentId={activeAgentId}
            onSelect={selectPinnedAgent}
          />
        </>
      }
      // `flex-1 min-h-0` (matching AgentRunSidebarMenu) lets the inner list's
      // `overflow-y-auto` actually scroll inside the shell's flex sidebar /
      // mobile drawer instead of overflowing it.
      className="bg-transparent min-h-0 flex-1"
    />
  );
}

/**
 * Voice agent mode-shortcut for the expanded sidebar. Sits ABOVE pinned
 * agents because it's a different modality (realtime voice), not a chat
 * entry. Active when the current route is anywhere under `/chat/voice`.
 */
function VoiceAgentShortcut({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="px-2 pt-2">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5",
          "text-sm transition-colors",
          active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            active
              ? "bg-primary/15 text-primary"
              : "bg-muted/60 text-muted-foreground group-hover:text-foreground",
          )}
        >
          <Mic className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="flex-1 text-left">Voice agent</span>
      </button>
    </div>
  );
}
