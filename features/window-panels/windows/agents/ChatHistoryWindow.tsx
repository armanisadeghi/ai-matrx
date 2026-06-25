"use client";

/**
 * ChatHistoryWindow — cross-agent conversation history ("browse everything").
 *
 * The list sidebar is the canonical `ConversationHistorySidebar` (dense
 * variant) wired to the scoped `conversation-history` pipeline with
 * `agentIds: []` (every accessible agent) and `surfaceId="history-window"`
 * (no default source filter → shows everything, with the source-filter tree
 * + date/agent grouping + search built in). Selecting a conversation renders
 * it read-only in the main pane via `AgentConversationDisplay`.
 *
 * The same data layer powers the frameless `ChatHistoryWorkspace` (Utilities
 * Hub "AI Results" tab), so the floating window and the embedded surface stay
 * identical without duplication.
 *
 * Replaces the legacy `quickChatHistory` sheet that pointed at
 * `features/prompts/components/results-display/QuickChatHistorySheet.tsx`.
 */

import React, { useCallback, useState } from "react";
import { Flame, History } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";

import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";

import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import type { HistoryGrouping } from "@/features/agents/redux/conversation-history/types";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";

const SURFACE_KEY = "ai-results-window";
const WORKSPACE_INPUT_SURFACE_KEY = "ai-results-workspace";

/**
 * Scoped conversation-history key for the cross-agent browser. Shared by the
 * floating window and the embedded workspace so both read the same fetched
 * page + grouping + source-filter state.
 */
const HISTORY_SCOPE = "history-window";

/** Stable empty array — `agentIds: []` = every accessible agent. */
const ALL_AGENTS: string[] = [];

type GroupBy = HistoryGrouping;

// ── Window component ─────────────────────────────────────────────────────────

interface ChatHistoryWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Initial conversation to focus (e.g. when launched from a deep-link). */
  initialSelectedConversationId?: string | null;
  /** Initial grouping mode. Default `"date"` — that's how people use it. */
  initialGroupBy?: GroupBy;
}

export default function ChatHistoryWindow({
  isOpen,
  onClose,
  initialSelectedConversationId,
  initialGroupBy,
}: ChatHistoryWindowProps) {
  if (!isOpen) return null;
  return (
    <ChatHistoryWindowInner
      onClose={onClose}
      initialSelectedConversationId={initialSelectedConversationId ?? null}
      initialGroupBy={initialGroupBy ?? "date"}
    />
  );
}

// ── Shared data layer ────────────────────────────────────────────────────────

/**
 * Selection + read-only-load state for the chat-history browser. Shared by the
 * floating window (`ChatHistoryWindow`) and the embedded, frameless workspace
 * (`ChatHistoryWorkspace`). The list itself is the canonical
 * `ConversationHistorySidebar`, so this hook no longer owns search / grouping /
 * agent-filter state — those live in the scoped slice + the primitive.
 */
function useChatHistoryBrowser(opts: {
  initialSelectedConversationId: string | null;
  initialGroupBy: GroupBy;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const [selectedId, setSelectedId] = useState<string | null>(
    opts.initialSelectedConversationId,
  );
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const handleSelect = useCallback(
    async (conv: ConversationListItem) => {
      const conversationId = conv.conversationId;
      const agentId = conv.agentId ?? null;
      setSelectedId(conversationId);
      setSelectedAgentId(agentId);

      const state = store.getState() as RootState;
      const exists = !!state.conversations?.byConversationId?.[conversationId];

      // Mirror the /chat load sequence: warm the agent's execution payload and
      // create the instance BEFORE hydrating, so the transcript renderer has
      // everything it needs (this is what /chat does and the window didn't —
      // the cause of assistant turns rendering blank here). Fire the agent
      // fetch in parallel; only the instance create must precede the load.
      if (agentId) {
        void dispatch(fetchAgentExecutionMinimal(agentId));
        if (!exists) {
          await dispatch(
            createManualInstance({
              agentId,
              conversationId,
              apiEndpointMode: "agent",
              responseDensity: "compact",
            }),
          );
        }
      }

      await dispatch(
        loadConversation({
          conversationId,
          surfaceKey: SURFACE_KEY,
        }),
      );
    },
    [dispatch, store],
  );

  // "Open in new tab" / "Copy link" target for each row's context menu.
  const getConversationHref = useCallback(
    (conv: ConversationListItem): string =>
      conv.agentId
        ? `/agents/${conv.agentId}/run?conversationId=${conv.conversationId}`
        : `/chat?conversationId=${conv.conversationId}`,
    [],
  );

  // Subtitle shows the selected conversation's agent name when one is picked.
  const selectedAgentName = useAppSelector((state: RootState) =>
    selectedAgentId
      ? (selectAgentById(state, selectedAgentId)?.name ?? null)
      : null,
  );

  return {
    selectedId,
    initialGroupBy: opts.initialGroupBy,
    handleSelect,
    getConversationHref,
    selectedAgentName,
  };
}

type ChatHistoryBrowser = ReturnType<typeof useChatHistoryBrowser>;

/** The canonical conversation-history sidebar, wired to the browser state. */
function ChatHistoryListSidebarBound({ b }: { b: ChatHistoryBrowser }) {
  return (
    <ConversationHistorySidebar
      variant="dense"
      scopeId={HISTORY_SCOPE}
      agentIds={ALL_AGENTS}
      surfaceId="history-window"
      activeConversationId={b.selectedId}
      onOpenConversation={b.handleSelect}
      openInPlace
      defaultGrouping={b.initialGroupBy}
      getConversationHref={b.getConversationHref}
      surfaceKey={SURFACE_KEY}
      className="bg-card/30"
      emptyState={
        <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
          <History className="w-6 h-6 text-muted-foreground mb-2 opacity-40" />
          <p className="text-xs text-muted-foreground">No conversations yet</p>
        </div>
      }
    />
  );
}

/**
 * Main pane: the selected conversation, or the empty prompt.
 *
 * `enableInput` swaps the read-only transcript for the full
 * `AgentConversationColumn` — same centered transcript PLUS a SmartAgentInput —
 * so the Utilities Hub "AI Results" tab lets you keep chatting in the
 * conversation you picked. The floating window stays read-only.
 */
function ChatHistoryMain({
  selectedId,
  enableInput,
}: {
  selectedId: string | null;
  enableInput?: boolean;
}) {
  if (selectedId && enableInput) {
    return (
      <AgentConversationColumn
        key={selectedId}
        conversationId={selectedId}
        surfaceKey={WORKSPACE_INPUT_SURFACE_KEY}
        constrainWidth
        edgeToEdgeScroll
        smartInputProps={{
          sendButtonVariant: "blue",
          showSubmitOnEnterToggle: false,
        }}
      />
    );
  }
  return (
    <div className="h-full min-h-0 overflow-hidden">
      {selectedId ? (
        <div className="h-full w-full overflow-y-auto">
          <div className="mx-auto max-w-3xl w-full p-3">
            <AgentConversationDisplay conversationId={selectedId} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center px-6 text-muted-foreground">
          <Flame className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm font-medium">Select a conversation</p>
          <p className="text-xs opacity-60 mt-1">
            Pick any past run from the list to view it here. Switch between
            grouping by <strong>date</strong> or <strong>agent</strong> and
            filter by source in the sidebar.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Embedded workspace (no window frame) ─────────────────────────────────────

/**
 * Frameless chat-history browser: list sidebar + read-only conversation view,
 * filling its container. Rendered directly inside the Utilities Hub "AI
 * Results" tab; the same data layer powers the floating `ChatHistoryWindow`.
 */
export function ChatHistoryWorkspace({
  initialSelectedConversationId = null,
  initialGroupBy = "date",
  enableInput = false,
}: {
  initialSelectedConversationId?: string | null;
  initialGroupBy?: GroupBy;
  /** When true, a selected conversation gets a SmartAgentInput to keep chatting. */
  enableInput?: boolean;
}) {
  const b = useChatHistoryBrowser({
    initialSelectedConversationId,
    initialGroupBy,
  });
  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div className="w-72 shrink-0 overflow-hidden border-r border-border">
        <ChatHistoryListSidebarBound b={b} />
      </div>
      <div className="min-w-0 flex-1">
        <ChatHistoryMain selectedId={b.selectedId} enableInput={enableInput} />
      </div>
    </div>
  );
}

// ── Floating window ──────────────────────────────────────────────────────────

function ChatHistoryWindowInner({
  onClose,
  initialSelectedConversationId,
  initialGroupBy,
}: {
  onClose: () => void;
  initialSelectedConversationId: string | null;
  initialGroupBy: GroupBy;
}) {
  const b = useChatHistoryBrowser({
    initialSelectedConversationId,
    initialGroupBy,
  });

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      selectedConversationId: b.selectedId,
    }),
    [b.selectedId],
  );

  const titleSuffix = b.selectedAgentName ? ` — ${b.selectedAgentName}` : "";

  return (
    <WindowPanel
      id="ai-results-window"
      title={`AI Results${titleSuffix}`}
      onClose={onClose}
      width={920}
      height={640}
      minWidth={520}
      minHeight={360}
      overlayId="quickChatHistory"
      onCollectData={collectData}
      sidebarDefaultSize={280}
      sidebarMinSize={220}
      defaultSidebarOpen
      sidebar={<ChatHistoryListSidebarBound b={b} />}
    >
      <ChatHistoryMain selectedId={b.selectedId} />
    </WindowPanel>
  );
}
