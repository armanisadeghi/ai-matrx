"use client";

/**
 * AgentRunWindow
 *
 * Floating-window equivalent of `/agents/[id]/run`.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  ▼ Agent ▾     Run · Agent Name              ⊕  ✕         │   ← WindowPanel title bar
 *   ├──────────────┬───────────────────────────────────────────────┤
 *   │ Conversations│ AgentConversationColumn (main experience)     │
 *   │ (sidebar)    │                                               │
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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Brain, Loader2, Plus, RotateCw } from "lucide-react";
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
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
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
import { DebugSessionActivator } from "@/features/agents/components/debug/DebugSessionActivator";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectUserInputEntryExists } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import type { SourceFeature } from "@/features/agents/types/instance.types";

const SOURCE_FEATURE: SourceFeature = "agent-runner";

const AGENT_RUN_SIDEBAR_DEFAULT_SIZE = Math.round(220 * 0.85);

/** Header-scale primary disc — must stay ≤ traffic-light row height (see WindowPanel `WindowHeader`). */
const HEADER_NEW_RUN_BTN =
  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary p-0 text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-2.5 [&_svg]:w-2.5";

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function AgentRunWindowSidebar({
  agentId,
  activeConversationId,
  onSelect,
}: {
  agentId: string | null;
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
}) {
  const canonicalAgentId = useAppSelector((state: RootState) => {
    if (!agentId) return null;
    const agent = selectAgentById(state, agentId);
    return agent?.parentAgentId ?? agent?.id ?? agentId;
  });

  const surfaceKey = agentId ? `${SOURCE_FEATURE}:${agentId}` : undefined;

  const handleOpenConversation = useCallback(
    (conv: ConversationListItem) => {
      onSelect(conv.conversationId);
    },
    [onSelect],
  );

  const getConversationHref = useCallback(
    (conv: ConversationListItem) => {
      const targetAgentId = conv.agentId ?? agentId;
      return targetAgentId
        ? `/agents/${targetAgentId}/run?conversationId=${conv.conversationId}`
        : `/chat/${conv.conversationId}`;
    },
    [agentId],
  );

  if (!agentId || !canonicalAgentId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-10 text-center">
          <Brain className="h-6 w-6 text-muted-foreground opacity-25" />
          <p className="text-xs text-muted-foreground">
            Select an agent from the header to see its history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConversationHistorySidebar
      variant="consumer"
      scopeId={`agent-run-window:${canonicalAgentId}`}
      agentIds={[canonicalAgentId]}
      surfaceId="chat"
      activeConversationId={activeConversationId}
      onOpenConversation={handleOpenConversation}
      openInPlace
      surfaceKey={surfaceKey}
      getConversationHref={getConversationHref}
      className="bg-transparent"
    />
  );
}

// ─── Header actions ───────────────────────────────────────────────────────────

function AgentRunWindowNewRunButton({
  agentId,
  onNewRunCleared,
}: {
  agentId: string;
  onNewRunCleared: () => void;
}) {
  const dispatch = useAppDispatch();
  const surfaceKey = `${SOURCE_FEATURE}:${agentId}`;
  const conversationId = useAppSelector(selectFocusedConversation(surfaceKey));

  const handleNewRun = useCallback(() => {
    if (!conversationId) return;
    dispatch(
      startNewConversation({
        currentConversationId: conversationId,
        surfaceKey,
      }),
    )
      .unwrap()
      .then(() => onNewRunCleared())
      .catch((err) =>
        console.error("[AgentRunWindow] Failed to start new run:", err),
      );
  }, [conversationId, dispatch, onNewRunCleared, surfaceKey]);

  return (
    <button
      type="button"
      onClick={handleNewRun}
      disabled={!conversationId}
      title="New run"
      aria-label="New run"
      className={HEADER_NEW_RUN_BTN}
    >
      <Plus strokeWidth={2.5} />
    </button>
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
  selectedConversationId: string | null;
  /**
   * Composed intent to pre-fill into the composer on open. When set, the body
   * launches a FRESH conversation (never revives the surface's cached focus)
   * and seeds this text once — the exact behavior the `/chat/a/[agentId]`
   * route gives the Shape-studio hand-offs, now in-place in the window. Pre-fill
   * only: the user reviews and sends (no auto-submit).
   */
  initialDraftText?: string | null;
}

function AgentRunBody({
  agentId,
  selectedConversationId,
  initialDraftText,
}: AgentRunBodyProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const surfaceKey = `${SOURCE_FEATURE}:${agentId}`;
  const hasDraft = Boolean(initialDraftText);

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
  // A seeded (draft) open mints a brand-new conversation instead of reusing the
  // surface's cached focus, so re-opening the window to build another kind never
  // revives the previous run's transcript (same reason the fresh chat route sets
  // `preferFresh`).
  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    ready: !isInitializing,
    preferFresh: hasDraft,
  });

  // ── Seed the composed draft into the fresh conversation's composer ─────────
  // Applied once the launcher's input entry exists (setUserInputText requires
  // `instanceUserInput.byConversationId[cid]`). Ref-guarded so the single seed
  // happens exactly once per conversation. Mirrors ChatRoomClient's draft-
  // transfer effect — pre-fill only, never auto-submit.
  const draftEntryReady = useAppSelector((state) =>
    conversationId ? selectUserInputEntryExists(conversationId)(state) : false,
  );
  const draftSeededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialDraftText || !conversationId || !draftEntryReady) return;
    if (draftSeededRef.current === conversationId) return;
    draftSeededRef.current = conversationId;
    dispatch(setUserInputText({ conversationId, text: initialDraftText }));
  }, [initialDraftText, conversationId, draftEntryReady, dispatch]);

  // ── Sync selectedConversationId → load + focus (replaces URL sync) ─────────
  const lastLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedConversationId) {
      lastLoadedRef.current = null;
    }
  }, [selectedConversationId]);

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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <DebugSessionActivator />
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          constrainWidth
          edgeToEdgeScroll
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
  initialAgentName?: string | null;
  /**
   * Composed intent to pre-fill into the composer on open (Shape-studio
   * hand-offs). Seeds a fresh conversation — see `AgentRunBodyProps`.
   */
  initialDraftText?: string | null;
}

export default function AgentRunWindow({
  isOpen,
  onClose,
  initialAgentId,
  initialSelectedConversationId,
  initialAgentName,
  initialDraftText,
}: AgentRunWindowProps) {
  if (!isOpen) return null;
  return (
    <AgentRunWindowInner
      onClose={onClose}
      initialAgentId={initialAgentId ?? null}
      initialSelectedConversationId={initialSelectedConversationId ?? null}
      initialAgentName={initialAgentName ?? null}
      initialDraftText={initialDraftText ?? null}
    />
  );
}

function AgentRunWindowInner({
  onClose,
  initialAgentId,
  initialSelectedConversationId,
  initialAgentName,
  initialDraftText,
}: {
  onClose: () => void;
  initialAgentId: string | null;
  initialSelectedConversationId: string | null;
  initialAgentName: string | null;
  initialDraftText: string | null;
}) {
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(initialSelectedConversationId);

  // Prefer the live name from the store; fall back to the caller-supplied name
  // — but only while we're still on the agent that name belongs to. Once the
  // user picks a different agent, the seed no longer applies (the dropdown has
  // loaded real names by then), so we drop to the generic placeholder.
  const liveAgentName = useAppSelector((state: RootState) =>
    agentId ? (selectAgentName(state, agentId) ?? null) : null,
  );
  const agentName =
    liveAgentName ??
    (agentId && agentId === initialAgentId ? initialAgentName : null) ??
    "Agent";

  const liveConversationId = useLiveConversationId(agentId);
  const activeConversationId = selectedConversationId ?? liveConversationId;

  const handleAgentSelect = useCallback((nextId: string) => {
    setAgentId(nextId);
    setSelectedConversationId(null);
  }, []);

  const handleConversationSelect = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
  }, []);

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
      actionsRight={
        agentId ? (
          <AgentRunWindowNewRunButton
            agentId={agentId}
            onNewRunCleared={handleNewRunCleared}
          />
        ) : undefined
      }
      sidebar={
        <AgentRunWindowSidebar
          agentId={agentId}
          activeConversationId={activeConversationId}
          onSelect={handleConversationSelect}
        />
      }
      sidebarDefaultSize={AGENT_RUN_SIDEBAR_DEFAULT_SIZE}
      sidebarMinSize={160}
      defaultSidebarOpen
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {agentId ? (
        <AgentRunBody
          key={agentId}
          agentId={agentId}
          selectedConversationId={selectedConversationId}
          initialDraftText={initialDraftText}
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
    </WindowPanel>
  );
}
