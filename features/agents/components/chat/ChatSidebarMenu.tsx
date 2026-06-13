"use client";

// ChatSidebarMenu — conversation history + chat-route actions, rendered INSIDE
// the app shell sidebar (registered in `route-menu-registry`).
//
// Architecture (load-bearing — do not "invent your own structure"):
//
//   1. CHROME ROWS (always rendered, IDENTICAL DOM in both collapsed and
//      expanded states): New chat · Search chats · Search agents · Voice
//      agent. Each row uses the EXACT same `.shell-nav-item shell-tactile-
//      subtle` markup as the main app's `<NavItem>` (see
//      `features/shell/components/sidebar/NavItem.tsx`). That gives us, for
//      free and without re-inventing:
//        · identical icon size / vertical spacing / hover / active to every
//          other shell nav item
//        · the icon stays at the EXACT same x/y in both states — the
//          collapse animation only toggles `.shell-nav-label` opacity and
//          width, the icon never moves
//        · the collapsed `[title]:hover::after` tooltip
//      The chrome positions never shift on toggle, which is the entire point.
//
//   2. EXTRAS (pinned agents + grouped history): only rendered when the
//      shell sidebar is expanded — there is no room in the narrow rail.
//      The chrome above stays put either way; only what shows BELOW the
//      chrome differs.
//
// Search affordances:
//   · "Search chats" wraps a chrome row in a Popover whose content is
//     `<ChatHistorySidebar initialSearchOpen>` — full history with focused
//     search. Uses its own scope (`chat-route-search`) so its in-popover
//     search term doesn't silently filter the always-on sidebar list after
//     the popover closes.
//   · "Search agents" reuses the canonical `AgentListDropdown` via
//     `triggerSlot` (no parallel agent picker), with `contentSide="right"`
//     so the panel opens beside the rail.
//   · The inner ChatHistorySidebar that renders below the chrome passes
//     `hideSearchAffordance` so it doesn't double up.
//
// Whenever this surface diverges from the main app nav's look or spacing,
// the fix is to align it back to the shell's canonical `.shell-nav-item`
// pattern — NOT to add a parallel styling system here.

import { useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
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

/** Sidebar history list scope. Stable, owned by ChatSidebarMenu. */
const CHAT_HISTORY_SCOPE = "chat-route";
/** Independent scope for the Search Chats popover — keeps the popover's
 *  searchTerm from bleeding into the always-on sidebar list when closed. */
const CHAT_HISTORY_SEARCH_SCOPE = "chat-route-search";

/**
 * `cx_conversation.source_feature` values to hide from the chat history.
 * Voice transcripts (xAI Realtime) live in `cx_conversation` too but can't
 * be replayed in the text-chat view, so they're filtered out here. A future
 * voice-history surface will load them via its own scope.
 */
const CHAT_HISTORY_EXCLUDE: ReadonlyArray<string> = ["voice-agent"];

/** Voice agent route. */
const VOICE_AGENT_HREF = "/chat/voice";

/** Canonical chrome-row class — identical to NavItem.tsx PLUS the
 *  `shell-nav-stable` height modifier so the row height stays the same
 *  across collapse/expand (otherwise `.shell-nav-item`'s padding switch
 *  produces a ~7px-per-row drift visible when the sidebar opens or
 *  closes). The label visibility and icon centering on collapse are
 *  handled entirely by shell.css. */
const NAV_ITEM_CLASS = "shell-nav-item shell-nav-stable shell-tactile-subtle";
/** Lucide size + stroke that match NavItem.tsx exactly. */
const ICON_SIZE = 18;
const ICON_STROKE = 1.75;

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
  // `+` always lands on the canonical new-chat surface (`/chat/new`), which
  // mounts the default agent + greeting. Routing unconditionally here means
  // the button works from any chat URL — including `/chat/a/[agentId]`, where
  // the old "reuse the active agent" branch produced a same-URL `router.push`
  // no-op and the button looked dead.
  const handleNewChat = useCallback(() => {
    router.push("/chat/new");
  }, [router]);

  return (
    // gap-0.5 (= 0.125rem) matches `.shell-sidebar-main-nav` / `route-nav`
    // gap so the chrome rows sit at the exact same rhythm as the main app
    // nav items.
    <div className="flex flex-1 min-h-0 flex-col gap-0.5">
      {/* ── CHROME ROWS ── identical DOM in both states. Icons NEVER move
            on collapse/expand. Order is fixed; positions are stable. */}

      {/* New chat */}
      <button
        type="button"
        onClick={handleNewChat}
        title="New chat"
        aria-label="New chat"
        className={NAV_ITEM_CLASS}
      >
        <span className="shell-nav-icon">
          <Plus size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </span>
        <span className="shell-nav-label">New chat</span>
      </button>

      {/* Search chats — popover (independent scope so it doesn't filter
          the sidebar list after close). */}
      <Popover open={chatSearchOpen} onOpenChange={setChatSearchOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Search chats"
            aria-label="Search chats"
            className={NAV_ITEM_CLASS}
          >
            <span className="shell-nav-icon">
              <Search size={ICON_SIZE} strokeWidth={ICON_STROKE} />
            </span>
            <span className="shell-nav-label">Search chats</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-80 overflow-hidden p-0"
        >
          <div className="flex h-[min(70dvh,560px)] flex-col">
            <ChatHistorySidebar
              scopeId={CHAT_HISTORY_SEARCH_SCOPE}
              activeConversationId={activeConversationId}
              excludeSourceFeatures={CHAT_HISTORY_EXCLUDE as string[]}
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

      {/* Search agents — reuses the canonical AgentListDropdown via
          triggerSlot. `contentSide="right"` opens the panel beside the
          rail (not over it). */}
      <AgentListDropdown
        onSelect={selectPinnedAgent}
        contentSide="right"
        triggerSlot={
          <button
            type="button"
            title="Search agents"
            aria-label="Search agents"
            className={NAV_ITEM_CLASS}
          >
            <span className="shell-nav-icon">
              {/* Webhook mirrors the app's "Agents" nav icon for a
                  consistent visual language (Bot is banned as an AI-cliché
                  glyph by matrx/no-banned-lucide-icons). */}
              <Webhook size={ICON_SIZE} strokeWidth={ICON_STROKE} />
            </span>
            <span className="shell-nav-label">Search agents</span>
          </button>
        }
      />

      {/* Voice agent — real route, so a <Link>. Active state via the same
          `.shell-active-pill` the main nav uses. */}
      <Link
        href={VOICE_AGENT_HREF}
        title="Voice agent"
        aria-label="Voice agent"
        aria-current={isVoiceRoute ? "page" : undefined}
        className={cn(NAV_ITEM_CLASS, isVoiceRoute && "shell-active-pill")}
      >
        <span className="shell-nav-icon">
          <Mic size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </span>
        <span className="shell-nav-label">Voice agent</span>
      </Link>

      {/* ── EXTRAS ── expanded-only. The chrome above keeps its positions
            either way; only what shows BELOW the chrome differs. */}
      {expanded && (
        <div className="flex flex-1 min-h-0 flex-col">
          <PinnedAgentsSection
            activeAgentId={activeAgentId}
            onSelect={selectPinnedAgent}
          />
          <ChatHistorySidebar
            scopeId={CHAT_HISTORY_SCOPE}
            activeConversationId={activeConversationId}
            onOpenConversation={openConversation}
            // Voice transcripts can't be replayed in the text-chat view —
            // filter them out at the query so they never enter this scope.
            excludeSourceFeatures={CHAT_HISTORY_EXCLUDE as string[]}
            // The Search chats chrome above is the single search entry
            // point — don't ship a second one inline.
            hideSearchAffordance
            // `flex-1 min-h-0` (matching AgentRunSidebarMenu) lets the
            // inner list's `overflow-y-auto` actually scroll inside the
            // shell's flex sidebar / mobile drawer.
            className="bg-transparent min-h-0 flex-1"
          />
        </div>
      )}
    </div>
  );
}
