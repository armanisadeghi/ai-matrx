"use client";

/**
 * AgentRunWindow
 *
 * Floating-window equivalent of `/agents/[id]/run`.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  ▼ Agent ▾     Run · Agent Name              ⚙  ⋯  ✕         │   ← WindowPanel title bar
 *   ├──────────────┬───────────────────────────────────────────────┤
 *   │ Conversations│ mode controller · new run · save · options   │   ← body strip
 *   │ (sidebar)    │ ── AgentConversationColumn (main experience) │
 *   │              │                                               │
 *   └──────────────┴───────────────────────────────────────────────┘
 *
 * Compared to `/agents/[id]/run`:
 *   - The "main app" sidebar is recreated locally (scoped to the selected agent).
 *   - Agent selection lives in the window title (not the shell nav).
 *   - Everything else — launcher hook, conversation loading, new-run — mirrors
 *     the route so behavior is identical.
 *
 * Switching agents remounts `AgentRunBody` via `key={agentId}`, so the managed
 * `useAgentLauncher` properly disposes the previous instance and reinitializes
 * for the new agent. Clicking a past conversation in the sidebar dispatches
 * `loadConversation` (with the window's surfaceKey) which sets focus, causing
 * the launcher-managed `conversationId` to switch to the loaded one.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  selectAgentById,
  selectAgentExecutionPayload,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { fetchAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import { makeSelectAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { selectLatestConversationId } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectFocusedConversation } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { startNewConversation } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import {
  registerSurface,
  unregisterSurface,
} from "@/features/agents/redux/surfaces/surfaces.slice";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { AgentModeController } from "@/features/agents/components/shared/AgentModeController";
import { AgentSaveStatus } from "@/features/agents/components/shared/AgentSaveStatus";
import { AgentOptionsMenu } from "@/features/agents/components/shared/AgentOptionsMenu";
import { PlusTapButton } from "@/components/icons/tap-buttons";
import { DebugSessionActivator } from "@/features/agents/components/debug/DebugSessionActivator";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import {
  useConversationRowMenu,
  type ConversationRowMenuData,
  type MenuAnchor,
} from "@/features/agents/components/conversation-actions/useConversationRowMenu";
import { ConversationRowMenu } from "@/features/agents/components/conversation-actions/ConversationRowMenu";

const SOURCE_FEATURE: SourceFeature = "agent-run-window";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function AgentRunWindowSidebar({
  agentId,
  activeConversationId,
  onSelect,
  onOpenMenu,
}: {
  agentId: string | null;
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onOpenMenu: (conv: ConversationListItem, anchor: MenuAnchor) => void;
}) {
  const dispatch = useAppDispatch();

  const canonicalAgentId = useAppSelector((state: RootState) => {
    if (!agentId) return null;
    const agent = selectAgentById(state, agentId);
    return agent?.parentAgentId ?? agent?.id ?? agentId;
  });

  const agentName = useAppSelector((state: RootState) =>
    agentId ? (selectAgentName(state, agentId) ?? null) : null,
  );

  const selectConversations = useMemo(
    () =>
      canonicalAgentId
        ? makeSelectAgentConversations(canonicalAgentId, null)
        : null,
    [canonicalAgentId],
  );

  const conversationState = useAppSelector((state) =>
    selectConversations ? selectConversations(state) : null,
  );
  const status = conversationState?.status ?? "idle";
  const conversations = conversationState?.conversations ?? [];
  const error = conversationState?.error ?? null;

  useEffect(() => {
    if (canonicalAgentId && status === "idle") {
      dispatch(
        fetchAgentConversations({
          agentId: canonicalAgentId,
          versionFilter: null,
        }),
      );
    }
  }, [canonicalAgentId, status, dispatch]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-1 border-b border-border/50 shrink-0 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
          {agentName ? `${agentName} History` : "Conversations"}
        </span>
        {status === "loading" && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!agentId && (
          <div className="flex flex-col items-center justify-center py-10 px-3 text-center gap-2">
            <Brain className="w-6 h-6 text-muted-foreground opacity-25" />
            <p className="text-xs text-muted-foreground">
              Select an agent from the header to see its history.
            </p>
          </div>
        )}

        {agentId && status === "failed" && (
          <p className="px-3 py-2 text-[10px] text-destructive">
            {error ?? "Failed to load"}
          </p>
        )}

        {agentId && status === "succeeded" && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-3 text-center gap-2">
            <MessageSquare className="w-5 h-5 text-muted-foreground opacity-40" />
            <p className="text-xs text-muted-foreground">
              No conversations yet
            </p>
          </div>
        )}

        {agentId &&
          conversations.map((conv) => (
            <ConversationListRow
              key={conv.conversationId}
              conv={conv}
              isActive={conv.conversationId === activeConversationId}
              onSelect={() => onSelect(conv.conversationId)}
              onOpenMenu={onOpenMenu}
            />
          ))}
      </div>
    </div>
  );
}

function ConversationListRow({
  conv,
  isActive,
  onSelect,
  onOpenMenu,
}: {
  conv: ConversationListItem;
  isActive: boolean;
  onSelect: () => void;
  onOpenMenu: (conv: ConversationListItem, anchor: MenuAnchor) => void;
}) {
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const date = formatDate(conv.updatedAt);
  return (
    <div
      className={cn(
        "group flex items-start gap-2 w-full pr-1 transition-colors border-l-2",
        isActive
          ? "border-primary bg-primary/8 text-primary"
          : "border-transparent hover:bg-muted/40 text-foreground",
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(conv, e);
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 min-w-0 flex items-start gap-2 px-2 py-1.5 text-left"
      >
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-xs font-medium truncate leading-tight",
              isActive ? "text-primary" : "text-foreground",
            )}
          >
            {conv.title?.trim() || "Untitled"}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <MessageSquare className="w-2.5 h-2.5 text-muted-foreground/70 shrink-0" />
            <span className="text-[10px] text-muted-foreground/70">
              {conv.messageCount}
              {date ? ` · ${date}` : ""}
            </span>
          </div>
        </div>
        {isActive && (
          <ChevronRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
        )}
      </button>
      <button
        ref={menuBtnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (menuBtnRef.current) onOpenMenu(conv, menuBtnRef.current);
        }}
        className={cn(
          "shrink-0 self-start mt-1.5 flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground",
          "opacity-100 md:opacity-0 md:group-hover:opacity-100",
        )}
        aria-label="More options"
        title="More options"
      >
        <MoreHorizontal size={12} />
      </button>
    </div>
  );
}

// ─── Title bar content (agent selector) ───────────────────────────────────────

function WindowTitleContent({
  agentId,
  displayName,
  onAgentSelect,
}: {
  agentId: string | null;
  displayName: string;
  onAgentSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-medium text-muted-foreground shrink-0">
        Run
      </span>
      <AgentListDropdown
        onSelect={onAgentSelect}
        label={agentId ? displayName : "Select agent…"}
        noBorder
        compact
        className="max-w-[180px] md:max-w-[240px] rounded-none bg-transparent"
      />
    </div>
  );
}

// ─── Body (agent-scoped, remounts when agentId changes) ───────────────────────

interface AgentRunBodyProps {
  agentId: string;
  currentPath: string;
  selectedConversationId: string | null;
  onNewRunCleared: () => void;
}

function AgentRunBody({
  agentId,
  currentPath,
  selectedConversationId,
  onNewRunCleared,
}: AgentRunBodyProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const surfaceKey = `${SOURCE_FEATURE}:${agentId}`;

  // Register as a `window` surface — fork outcomes update the window's
  // internal focus (no URL change). The conversation column already
  // re-renders on focus changes, so no pendingNavigation effect is
  // needed here.
  useEffect(() => {
    dispatch(
      registerSurface({
        surfaceKey,
        kind: "window",
      }),
    );
    return () => {
      dispatch(unregisterSurface(surfaceKey));
    };
  }, [dispatch, surfaceKey]);

  // ── Agent execution payload bootstrap (mirrors AgentRunnerPage) ────────────
  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );

  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setIsInitializing(true);
      setInitError(null);
      try {
        if (!executionPayload.isReady) {
          await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
        }
      } catch (err) {
        console.error(
          "[AgentRunWindow] Failed to load agent execution payload:",
          err,
        );
        if (!cancelled) {
          setInitError(
            err instanceof Error ? err.message : "Failed to load agent.",
          );
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, initAttempt]);

  // ── Managed launcher ───────────────────────────────────────────────────────
  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    ready: !isInitializing,
  });

  // ── Sync selectedConversationId → load + focus (replaces URL sync) ─────────
  const lastLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedConversationId || isInitializing) return;
    if (selectedConversationId === lastLoadedRef.current) return;
    if (selectedConversationId === conversationId) return;
    lastLoadedRef.current = selectedConversationId;

    (async () => {
      const exists = !!(store.getState() as RootState).conversations
        ?.byConversationId[selectedConversationId];

      if (!exists) {
        try {
          await dispatch(
            createManualInstance({
              agentId,
              conversationId: selectedConversationId,
              apiEndpointMode: "agent",
            }),
          ).unwrap();
        } catch (err) {
          console.error("[AgentRunWindow] createManualInstance failed", err);
          return;
        }
      }

      try {
        await dispatch(
          loadConversation({
            conversationId: selectedConversationId,
            surfaceKey,
          }),
        ).unwrap();
      } catch (err) {
        console.error("[AgentRunWindow] loadConversation failed", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, isInitializing, conversationId]);

  const handleNewRun = useCallback(() => {
    if (!conversationId) return;
    dispatch(
      startNewConversation({
        currentConversationId: conversationId,
        surfaceKey,
      }),
    )
      .unwrap()
      .then(() => {
        lastLoadedRef.current = null;
        onNewRunCleared();
      })
      .catch((err) =>
        console.error("[AgentRunWindow] Failed to start new run:", err),
      );
  }, [conversationId, surfaceKey, dispatch, onNewRunCleared]);

  if (initError && !isInitializing) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md w-full rounded-lg border border-destructive/40 bg-destructive/5 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">
              Couldn&apos;t reach the agent service
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-snug">
            {initError}
          </p>
          <Button
            size="sm"
            className="self-start gap-1.5"
            onClick={() => setInitAttempt((n) => n + 1)}
          >
            <RotateCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isInitializing || !conversationId) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Loading agent…</span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <DebugSessionActivator />

      {/* Thin control strip: mode + actions (replaces AgentRunHeader) */}
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-1">
          <PlusTapButton onClick={handleNewRun} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <AgentSaveStatus agentId={agentId} />
          <AgentOptionsMenu agentId={agentId} />
        </div>
      </div>

      {/* Main conversation column */}
      <div className="flex-1 overflow-hidden flex justify-center min-w-0">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          constrainWidth
          smartInputProps={{
            sendButtonVariant: "blue",
            showSubmitOnEnterToggle: true,
          }}
        />
      </div>
    </div>
  );
}

// Tracks the live conversation in the window for persistence (so reopening
// lands you on whatever you last had focused rather than the initial pick).
function useLiveConversationId(agentId: string | null): string | null {
  const surfaceKey = agentId ? `${SOURCE_FEATURE}:${agentId}` : null;
  const focusedId = useAppSelector((state: RootState) =>
    surfaceKey ? selectFocusedConversation(surfaceKey)(state) : null,
  );
  return useAppSelector((state: RootState) =>
    focusedId
      ? (selectLatestConversationId(focusedId)(state) ?? focusedId)
      : null,
  );
}

// ─── Window shell ────────────────────────────────────────────────────────────

interface AgentRunWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialAgentId?: string | null;
  initialSelectedConversationId?: string | null;
}

export default function AgentRunWindow({
  isOpen,
  onClose,
  initialAgentId,
  initialSelectedConversationId,
}: AgentRunWindowProps) {
  if (!isOpen) return null;
  return (
    <AgentRunWindowInner
      onClose={onClose}
      initialAgentId={initialAgentId ?? null}
      initialSelectedConversationId={initialSelectedConversationId ?? null}
    />
  );
}

function AgentRunWindowInner({
  onClose,
  initialAgentId,
  initialSelectedConversationId,
}: {
  onClose: () => void;
  initialAgentId: string | null;
  initialSelectedConversationId: string | null;
}) {
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(initialSelectedConversationId);

  const agentName = useAppSelector((state: RootState) =>
    agentId ? (selectAgentName(state, agentId) ?? "Agent") : "Agent",
  );

  const liveConversationId = useLiveConversationId(agentId);
  const activeConversationId = selectedConversationId ?? liveConversationId;

  const handleAgentSelect = useCallback((nextId: string) => {
    setAgentId(nextId);
    setSelectedConversationId(null);
  }, []);

  const handleConversationSelect = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
  }, []);

  const rowMenu = useConversationRowMenu();
  const openRowMenu = useCallback(
    (conv: ConversationListItem, anchor: MenuAnchor) => {
      const targetAgentId = conv.agentId ?? agentId;
      if (!targetAgentId) return;
      const data: ConversationRowMenuData = {
        conversationId: conv.conversationId,
        title: conv.title,
        isFavorite: conv.isFavorite ?? false,
        isArchived: conv.status === "archived",
        excludeFromKg: conv.excludeFromKg ?? false,
        isOwner: true,
        href: `/agents/${targetAgentId}/run?conversationId=${conv.conversationId}`,
      };
      rowMenu.openForRow(data, anchor);
    },
    [agentId, rowMenu],
  );

  const handleNewRunCleared = useCallback(() => {
    setSelectedConversationId(null);
  }, []);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      agentId,
      selectedConversationId,
    }),
    [agentId, selectedConversationId],
  );

  return (
    <WindowPanel
      id="agent-run-window"
      titleNode={
        <WindowTitleContent
          agentId={agentId}
          displayName={agentName}
          onAgentSelect={handleAgentSelect}
        />
      }
      onClose={onClose}
      width={960}
      height={720}
      minWidth={560}
      minHeight={420}
      overlayId="agentRunWindow"
      onCollectData={collectData}
      sidebar={
        <AgentRunWindowSidebar
          agentId={agentId}
          activeConversationId={activeConversationId}
          onSelect={handleConversationSelect}
          onOpenMenu={openRowMenu}
        />
      }
      sidebarDefaultSize={220}
      sidebarMinSize={160}
      defaultSidebarOpen
      bodyClassName="p-0"
    >
      {agentId ? (
        <AgentRunBody
          key={agentId}
          agentId={agentId}
          currentPath={window.location.pathname}
          selectedConversationId={selectedConversationId}
          onNewRunCleared={handleNewRunCleared}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center text-muted-foreground">
          <Brain className="w-12 h-12 opacity-15" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Pick an agent to start
            </p>
            <p className="text-xs opacity-60">
              Use the agent dropdown in the title bar to choose an agent. Its
              past conversations appear in the sidebar.
            </p>
          </div>
        </div>
      )}

      <ConversationRowMenu {...rowMenu.menuProps} />
    </WindowPanel>
  );
}
