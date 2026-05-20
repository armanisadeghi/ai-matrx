"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelLeft, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { PinnedAgentsSection } from "./PinnedAgentsSection";
import {
  selectLastUsedAgentId,
  selectGlobalListStatus,
} from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import { fetchGlobalConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

interface ChatPageShellProps {
  /** Currently active conversation (highlights the row in history). */
  activeConversationId?: string;
  /** Currently active agent — drives the picker label. */
  activeAgentId?: string;
  /** Initial picker label before agent data hydrates (SSR-safe). */
  activeAgentName?: string;
  /** Picker trigger label fallback when no agent is selected. */
  pickerPlaceholder?: string;
  /** Called when the user selects an agent from the dropdown. */
  onAgentSelect?: (agentId: string) => void;
  /**
   * Called when the user clicks the "+ new chat" icon. Defaults to
   * `router.push('/chat/new')` when omitted, so most consumers don't
   * need to pass anything.
   */
  onNewChat?: () => void;
  children: React.ReactNode;
}

const CHAT_HISTORY_SCOPE = "chat-route";

// Hardcoded bindings for Phase 7 — wiring into the Phase 1 shortcut table
// is tracked as a follow-up once user-scope shortcuts expose a generic
// keybinding registry (see features/agents/migration/phases/phase-07-chat-route.md).
const KEYBINDINGS = {
  newChat: { key: "k", meta: true },
  focusInput: { key: "/", meta: false },
  openAgentPicker: { key: "j", meta: true },
  toggleHistory: { key: "b", meta: true },
} as const;

export function ChatPageShell({
  activeConversationId,
  activeAgentId,
  activeAgentName,
  pickerPlaceholder = "Select an agent",
  onAgentSelect,
  onNewChat,
  children,
}: ChatPageShellProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  // Desktop sidebar collapse state. Defaults expanded so the user lands
  // with their conversation history visible on first paint.
  const [historyExpanded, setHistoryExpanded] = useState(true);
  // Mobile drawer is a separate, transient overlay.
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);

  // ── Last-used agent ─────────────────────────────────────────────────────
  // Drives the `+` button: when a last-used agent can be derived from the
  // user's most recent conversation, route directly to /chat/a/[id] instead
  // of forcing the picker. Fetch the global conversation list on mount as a
  // safety net so the selector is populated whenever the shell mounts —
  // including direct deep-links to /chat/[conversationId] or /chat/a/[id].
  const globalListStatus = useAppSelector(selectGlobalListStatus);
  const lastUsedAgentId = useAppSelector(selectLastUsedAgentId);
  useEffect(() => {
    if (globalListStatus === "idle") {
      dispatch(fetchGlobalConversations({ limit: 25 }));
    }
  }, [dispatch, globalListStatus]);
  // NOTE: we do NOT eagerly fetch the agent list here. The chat sidebar's
  // PinnedAgentsSection reads from the centralized agent-consumers pipeline
  // and renders nothing until that data is already loaded — same lazy
  // behavior as AgentListDropdown (which calls initializeChatAgents() in
  // ensureLoaded() on first open). Fetching here would pull every agent on
  // every chat-route mount even for users with zero pinned agents.

  const focusInput = useCallback(() => {
    const el = document.querySelector<HTMLTextAreaElement>(
      "[data-agent-input-textarea]",
    );
    if (el) {
      el.focus();
      return;
    }
    const fallback = document.querySelector<HTMLTextAreaElement>("textarea");
    fallback?.focus();
  }, []);

  const openAgentPicker = useCallback(() => {
    // If the picker is hidden behind a collapsed sidebar (or off-screen on
    // mobile), surface it first and let React paint before we synth-click.
    if (!isMobile && !historyExpanded) setHistoryExpanded(true);
    if (isMobile && !historyDrawerOpen) setHistoryDrawerOpen(true);
    requestAnimationFrame(() => {
      const host = document.querySelector<HTMLElement>(
        "[data-chat-agent-picker-trigger]",
      );
      const btn = host?.querySelector<HTMLButtonElement>("button");
      btn?.click();
    });
  }, [isMobile, historyExpanded, historyDrawerOpen]);

  const handleNewChat = useCallback(() => {
    if (onNewChat) {
      onNewChat();
      return;
    }
    // Prefer the user's last-used agent so the `+` button feels stateful —
    // pressing it from any chat lands you back on the agent you've been
    // talking to most. Falls through to the picker for brand-new users.
    if (lastUsedAgentId) {
      router.push(`/chat/a/${encodeURIComponent(lastUsedAgentId)}`);
    } else {
      router.push("/chat/new");
    }
  }, [onNewChat, router, lastUsedAgentId]);

  const handlePinnedAgentSelect = useCallback(
    (agentId: string) => {
      if (onAgentSelect) {
        onAgentSelect(agentId);
      } else {
        router.push(`/chat/a/${encodeURIComponent(agentId)}`);
      }
    },
    [onAgentSelect, router],
  );

  const openConversation = useCallback(
    (conv: ConversationListItem) => {
      router.push(`/chat/${conv.conversationId}`);
    },
    [router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTypableElement =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        (target as HTMLElement | null)?.isContentEditable;

      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === KEYBINDINGS.newChat.key
      ) {
        e.preventDefault();
        handleNewChat();
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === KEYBINDINGS.openAgentPicker.key
      ) {
        e.preventDefault();
        openAgentPicker();
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === KEYBINDINGS.toggleHistory.key
      ) {
        e.preventDefault();
        if (isMobile) setHistoryDrawerOpen((v) => !v);
        else setHistoryExpanded((v) => !v);
        return;
      }
      if (!inTypableElement && e.key === KEYBINDINGS.focusInput.key) {
        e.preventDefault();
        focusInput();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusInput, handleNewChat, isMobile, openAgentPicker]);

  const pickerLabel = activeAgentName?.trim() || pickerPlaceholder;

  // ── Shared desktop header: [toggle] [agent picker] [+ new chat] ────────
  //
  // The three controls render in the exact same horizontal positions whether
  // the sidebar is expanded (header lives inside the sidebar) or collapsed
  // (header floats over the chat surface). `floating` only swaps the chrome
  // — translucent card + border + shadow — so the controls feel anchored
  // against the chat background instead of against the sidebar.
  const renderDesktopHeader = (floating: boolean) => (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center gap-1 pl-1.5 pr-1",
        floating
          ? "rounded-xl border border-border bg-card/90 shadow-sm backdrop-blur-md"
          : "border-b border-border",
      )}
    >
      <button
        type="button"
        onClick={() => setHistoryExpanded((v) => !v)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label={historyExpanded ? "Hide sidebar" : "Show sidebar"}
        title={historyExpanded ? "Hide sidebar (⌘B)" : "Show sidebar (⌘B)"}
      >
        <PanelLeft className="h-4 w-4" />
      </button>
      <div
        data-chat-agent-picker-trigger
        className="flex min-w-0 flex-1 items-center"
      >
        <AgentListDropdown
          key={`${floating ? "float" : "dock"}-${activeAgentId ?? "no-agent"}`}
          onSelect={onAgentSelect}
          label={pickerLabel}
          compact
          noBorder
          className="w-full justify-between bg-transparent"
        />
      </div>
      <button
        type="button"
        onClick={handleNewChat}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="New chat"
        title="New chat (⌘K)"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );

  // ── Mobile drawer top row: [toggle] [agent picker] [+ new chat] ────────
  const mobileTopRow = (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border pl-1.5 pr-1">
      <button
        type="button"
        onClick={() => setHistoryDrawerOpen(false)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        aria-label="Hide history"
        title="Hide history"
      >
        <PanelLeft className="h-4 w-4" />
      </button>
      <div
        data-chat-agent-picker-trigger
        className="flex min-w-0 flex-1 items-center"
      >
        <AgentListDropdown
          key={`mobile-${activeAgentId ?? "no-agent"}`}
          onSelect={(id) => {
            onAgentSelect?.(id);
            setHistoryDrawerOpen(false);
          }}
          label={pickerLabel}
          noBorder
          className="w-full justify-between bg-transparent"
        />
      </div>
      <button
        type="button"
        onClick={() => {
          setHistoryDrawerOpen(false);
          handleNewChat();
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        aria-label="New chat"
        title="New chat"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="h-full flex overflow-hidden bg-textured">
      {!isMobile && historyExpanded && (
        <aside
          className="hidden lg:flex w-64 shrink-0 border-r border-border flex-col overflow-hidden bg-card"
          aria-label="Chat history"
        >
          <ChatHistorySidebar
            scopeId={CHAT_HISTORY_SCOPE}
            activeConversationId={activeConversationId ?? null}
            onOpenConversation={openConversation}
            headerSlot={renderDesktopHeader(false)}
            topSlot={
              <PinnedAgentsSection
                activeAgentId={activeAgentId}
                onSelect={handlePinnedAgentSelect}
              />
            }
          />
        </aside>
      )}

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        {/* Floating header when the sidebar is collapsed. The three controls
            stay anchored in their original positions over the chat surface
            so the user never loses access to toggle / agent picker / new
            chat. Same height + same left offset as the in-sidebar header,
            so the layout reads as one continuous bar. */}
        {!isMobile && !historyExpanded && (
          <div className="absolute top-1.5 left-1.5 z-30 hidden lg:block w-72">
            {renderDesktopHeader(true)}
          </div>
        )}

        {isMobile && (
          <header
            className={cn(
              "shrink-0 flex items-center justify-between gap-1 px-1.5",
              "h-10 border-b border-border bg-card/60 backdrop-blur-sm",
            )}
          >
            <button
              type="button"
              onClick={() => setHistoryDrawerOpen(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              aria-label="Show history"
              title="Show history"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div
              data-chat-agent-picker-trigger
              className="flex min-w-0 flex-1 items-center justify-center"
            >
              <AgentListDropdown
                key={`mobile-header-${activeAgentId ?? "no-agent"}`}
                onSelect={onAgentSelect}
                label={pickerLabel}
                noBorder
                className="w-full justify-center bg-transparent"
              />
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              aria-label="New chat"
              title="New chat"
            >
              <Plus className="h-4 w-4" />
            </button>
          </header>
        )}

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>

      {isMobile && (
        <Drawer open={historyDrawerOpen} onOpenChange={setHistoryDrawerOpen}>
          <DrawerContent className="max-h-[85dvh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>
                {activeAgentName
                  ? `${activeAgentName} — conversations`
                  : "Conversation history"}
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 min-h-0 overflow-hidden pb-safe">
              <ChatHistorySidebar
                scopeId={CHAT_HISTORY_SCOPE}
                activeConversationId={activeConversationId ?? null}
                onOpenConversation={(conv) => {
                  setHistoryDrawerOpen(false);
                  router.push(`/chat/${conv.conversationId}`);
                }}
                headerSlot={mobileTopRow}
                topSlot={
                  <PinnedAgentsSection
                    activeAgentId={activeAgentId}
                    onSelect={(id) => {
                      setHistoryDrawerOpen(false);
                      handlePinnedAgentSelect(id);
                    }}
                  />
                }
              />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
