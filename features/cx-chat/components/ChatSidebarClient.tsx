"use client";

// app/(ssr)/ssr/chat/_components/ChatSidebarClient.tsx
//
// ALL client-side chat sidebar logic lives here.
//
// Server/client boundary philosophy:
//   - layout.tsx renders pure server HTML: the <aside>, divs, and static shells
//   - ChatPanelContent: the ONE client boundary for the panel body — owns
//     searchQuery state, renders the SidebarSearchGroup pill + lists
//   - ChatDesktopHeader: client island for the desktop header strip —
//     PanelLeft toggle + agent name selector
//
// Navigation: Uses Next.js router.push() for proper App Router navigation.

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const AgentPickerSheet = dynamic(
  () =>
    import("@/features/cx-chat/components/agent/AgentPickerSheet").then(
      (m) => ({ default: m.AgentPickerSheet }),
    ),
  { ssr: false },
);
import { useChatCatalogueInit } from "@/features/cx-chat/hooks/useChatCatalogueInit";
import { ChevronDown } from "lucide-react";
import { SidebarActions } from "@/features/cx-chat/components/sidebar/SidebarActions";
import { SsrSidebarAgents } from "./SsrSidebarAgents";
import { SsrSidebarChats } from "./SsrSidebarChats";
import { SidebarUserFooter } from "@/features/cx-chat/components/sidebar/SidebarUserFooter";
import {
  ChevronLeftTapButton,
  PanelLeftTapButton,
  PlusTapButton,
} from "@/components/icons/tap-buttons";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

function togglePanel() {
  const cb = document.getElementById(
    "shell-panel-toggle",
  ) as HTMLInputElement | null;
  if (cb) cb.checked = !cb.checked;
}

/** Close the mobile panel drawer — safe no-op on desktop (checkbox never checked). */
function closeMobilePanel() {
  const cb = document.getElementById(
    "shell-panel-mobile",
  ) as HTMLInputElement | null;
  if (cb) cb.checked = false;
}

// ============================================================================
// SIDEBAR SEARCH GROUP
// Glass pill: [< back] [search input] [+ new chat]
// ============================================================================

function SidebarSearchGroup({
  searchQuery,
  onSearchChange,
  leftButton,
  onNewChat,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  leftButton?: React.ReactNode;
  onNewChat: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasLeft = !!leftButton;

  return (
    <div className="relative inline-flex h-9 items-center w-full">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 rounded-full matrx-glass-thin-border" />
      <div className="relative flex items-center w-full">
        {leftButton}
        <div
          className={`flex-1 min-w-0 flex items-center gap-1.5 h-8 ${hasLeft ? "" : "pl-3"}`}
        >
          <svg
            className="flex-shrink-0 w-3.5 h-3.5 text-muted-foreground opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/70"
            style={{ fontSize: "16px", lineHeight: 1 }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                onSearchChange("");
                inputRef.current?.focus();
              }}
              className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
        <PlusTapButton
          variant="group"
          onClick={onNewChat}
          ariaLabel="New chat"
        />
      </div>
    </div>
  );
}

export function ChatPanelContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");

  const dispatch = useAppDispatch();

  // Fetch once on mount
  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);

  // Derive agentId and conversationId directly from the URL.
  // The sidebar and header only need these two values — nothing else.
  const agentIdFromUrl = (() => {
    const pathMatch = pathname.match(/\/ssr\/chat\/a\/([^/?]+)/);
    return pathMatch?.[1] ?? searchParams.get("agent") ?? undefined;
  })();

  const conversationIdFromUrl = (() => {
    const pathMatch = pathname.match(/\/ssr\/chat\/c\/([^/?]+)/);
    return pathMatch?.[1] ?? undefined;
  })();

  // Agent name for display — read directly from agentDefinition via the URL agentId.
  // No instance traversal needed: agentId is in the URL, name is in the catalogue.
  const activeAgentRecord = useAppSelector((state) =>
    agentIdFromUrl ? selectAgentById(state, agentIdFromUrl) : undefined,
  );

  const selectedAgentCompat = activeAgentRecord
    ? { promptId: activeAgentRecord.id, name: activeAgentRecord.name }
    : null;

  const handleSelectChat = useCallback(
    (id: string) => {
      closeMobilePanel();
      const url = agentIdFromUrl
        ? `/ssr/chat/c/${id}?agent=${agentIdFromUrl}`
        : `/ssr/chat/c/${id}`;
      router.push(url);
    },
    [router, agentIdFromUrl],
  );

  const handleNewChat = useCallback(() => {
    closeMobilePanel();
    router.push(agentIdFromUrl ? `/ssr/chat/a/${agentIdFromUrl}` : "/ssr/chat");
  }, [router, agentIdFromUrl]);

  const handleAgentSelect = useCallback(
    (agent: { promptId: string }) => {
      closeMobilePanel();
      // Navigation triggers ChatInstanceManager on the new page to handle instance lifecycle.
      router.push(`/ssr/chat/a/${agent.promptId}`);
    },
    [router],
  );

  const handleBack = useCallback(() => {
    const panelCheckbox = document.getElementById(
      "shell-panel-mobile",
    ) as HTMLInputElement | null;
    const menuCheckbox = document.getElementById(
      "shell-mobile-menu",
    ) as HTMLInputElement | null;
    if (panelCheckbox) panelCheckbox.checked = false;
    if (menuCheckbox) menuCheckbox.checked = true;
  }, []);

  return (
    <>
      {/* ── Mobile header row ────────────────────────────────────────── */}
      <div
        className="lg:hidden flex items-center flex-shrink-0"
        style={{
          height: "var(--shell-header-h)",
          marginTop: "calc(-1 * var(--shell-header-h))",
        }}
      >
        <SidebarSearchGroup
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          leftButton={
            <ChevronLeftTapButton
              variant="group"
              onClick={handleBack}
              ariaLabel="Back to main navigation"
            />
          }
          onNewChat={handleNewChat}
        />
      </div>

      {/* ── Panel body ─────────────────────────────────────────────── */}
      <div className="shell-panel-body">
        <div className="h-full flex flex-col overflow-hidden">
          {/* Desktop search */}
          <div className="hidden lg:block flex-shrink-0">
            <SidebarSearchGroup
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onNewChat={handleNewChat}
            />
          </div>

          <SidebarActions
            onNewChat={handleNewChat}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
            <SsrSidebarAgents
              searchQuery={searchQuery}
              selectedAgent={selectedAgentCompat}
              onAgentSelect={handleAgentSelect}
            />
            <SsrSidebarChats
              activeRequestId={conversationIdFromUrl}
              onSelectChat={handleSelectChat}
              onNewChat={handleNewChat}
              searchQuery={searchQuery}
            />
          </div>

          <SidebarUserFooter />
        </div>
      </div>
    </>
  );
}

// ============================================================================
// CHAT DESKTOP HEADER
// ============================================================================

export function ChatDesktopHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // agentId is in the URL — read the name directly from agentDefinition.
  const agentIdFromUrl = (() => {
    const pathMatch = pathname.match(/\/ssr\/chat\/a\/([^/?]+)/);
    return pathMatch?.[1] ?? searchParams.get("agent") ?? undefined;
  })();

  const activeAgentRecord = useAppSelector((state) =>
    agentIdFromUrl ? selectAgentById(state, agentIdFromUrl) : undefined,
  );
  const displayName = activeAgentRecord?.name ?? "Matrx Chat";

  const handleNewChat = useCallback(() => {
    router.push(agentIdFromUrl ? `/ssr/chat/a/${agentIdFromUrl}` : "/ssr/chat");
  }, [router, agentIdFromUrl]);

  const handleAgentSelect = useCallback(
    (agent: { promptId: string }) => {
      setIsPickerOpen(false);
      router.push(`/ssr/chat/a/${agent.promptId}`);
    },
    [router],
  );

  return (
    <>
      <AgentPickerSheet
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        selectedAgent={
          activeAgentRecord
            ? { promptId: activeAgentRecord.id, name: activeAgentRecord.name }
            : null
        }
        onSelect={handleAgentSelect}
      />
      <div className="flex items-center w-full min-w-0">
        <PanelLeftTapButton
          onClick={togglePanel}
          ariaLabel="Toggle sidebar"
          className="text-muted-foreground"
        />
        <button
          onClick={() => setIsPickerOpen(true)}
          className="flex items-center gap-1 min-w-0 px-1.5 py-1 rounded-md hover:bg-accent/50 transition-colors"
          title={`Active agent: ${displayName}`}
        >
          <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
            {displayName}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        </button>
        <span className="ml-auto" />
        <PlusTapButton onClick={handleNewChat} ariaLabel="New chat" />
      </div>
    </>
  );
}

// ============================================================================
// LEGACY EXPORTS — kept to avoid breaking any stale import references
// ============================================================================

export function ChatPanel() {
  return null;
}
export function ChatSidebarHeader() {
  return null;
}
export function ChatSidebarBody() {
  return null;
}
export default function ChatSidebarClient() {
  return null;
}
