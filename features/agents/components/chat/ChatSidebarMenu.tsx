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

import { useState } from "react";
import { usePathname } from "next/navigation";
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

/** Sidebar history list scope. Stable, owned by ChatSidebarMenu. */
const CHAT_HISTORY_SCOPE = "chat-route";
/** Independent scope for the Search Chats popover — keeps the popover's
 *  searchTerm from bleeding into the always-on sidebar list when closed. */
const CHAT_HISTORY_SEARCH_SCOPE = "chat-route-search";

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
  const pathname = usePathname();
  const { activeConversationId, activeAgentId } = parseChatPath(pathname);
  const isVoiceRoute = pathname.startsWith(VOICE_AGENT_HREF);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);

  return (
    // gap-0.5 (= 0.125rem) matches `.shell-sidebar-main-nav` / `route-nav`
    // gap so the chrome rows sit at the exact same rhythm as the main app
    // nav items.
    <div className="flex flex-1 min-h-0 flex-col gap-0.5">
      {/* ── CHROME ROWS ── identical DOM in both states. Icons NEVER move
            on collapse/expand. Order is fixed; positions are stable. */}

      {/* New chat — Link so cmd/ctrl+click opens /chat/new in a new tab. */}
      <Link
        href="/chat/new"
        title="New chat"
        aria-label="New chat"
        className={NAV_ITEM_CLASS}
      >
        <span className="shell-nav-icon">
          <Plus size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </span>
        <span className="shell-nav-label">New chat</span>
      </Link>

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
              // ALLOW-list: the "chat" surface defaults to real chats only
              // (source_feature = chat-route). Everything else — system runs,
              // transcription, voice — is reachable via the filter tree.
              surfaceId="chat"
              activeConversationId={activeConversationId}
              onOpenConversation={() => setChatSearchOpen(false)}
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
        navigateTo="/chat/a/{id}"
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
          <PinnedAgentsSection activeAgentId={activeAgentId} />
          <ChatHistorySidebar
            scopeId={CHAT_HISTORY_SCOPE}
            activeConversationId={activeConversationId}
            // ALLOW-list (surface default): "chat" shows only real chats
            // (source_feature = chat-route). System runs, transcription, and
            // voice transcripts (which can't be replayed here) are hidden by
            // default and reachable through the source-filter tree.
            surfaceId="chat"
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
