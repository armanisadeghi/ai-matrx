"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAgentExecutionPayload,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAuthReady } from "@/lib/redux/selectors/userSelectors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import {
  registerSurface,
  unregisterSurface,
  selectPendingNavigation,
  clearPendingNavigation,
} from "@/features/agents/redux/surfaces/surfaces.slice";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ChatPageShell } from "./ChatPageShell";
import { ChatRoomSkeleton } from "./ChatRoomSkeleton";

interface ChatRoomClientProps {
  agentId: string;
  /** When provided, loads this existing conversation. Mounted by
   *  `/chat/[conversationId]`. When absent (mounted by `/chat/a/[agentId]`),
   *  the launcher creates a fresh instance. */
  conversationId?: string;
}

const SOURCE_FEATURE = "chat-route";

/**
 * Chat room client — orchestrates one conversation surface.
 *
 * Two mount paths, each with a single source of truth:
 *
 * - `/chat/a/[agentId]` mounts with NO `conversationId` prop. The launcher
 *   creates a fresh instance and owns the active id. After the first user
 *   submit, the streaming thunk's `record_reserved` event yields the canonical
 *   server UUID and a `pendingNavigation` effect calls `router.replace`.
 *
 * - `/chat/[conversationId]` mounts WITH the prop. The launcher is gated off
 *   (`ready: false`) and we load the existing conversation. The prop is the
 *   single source of truth — no parallel state.
 */
export function ChatRoomClient({
  agentId,
  conversationId: conversationIdProp,
}: ChatRoomClientProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();

  const surfaceKey = `${SOURCE_FEATURE}:${agentId}`;
  const authReady = useAppSelector(selectAuthReady);

  // Register this client as a `page` surface so action bars can route
  // fork / retry navigation outcomes correctly (URL change).
  useEffect(() => {
    dispatch(
      registerSurface({
        surfaceKey,
        kind: "page",
        basePath: "/chat/[conversationId]",
      }),
    );
    return () => {
      dispatch(unregisterSurface(surfaceKey));
    };
  }, [dispatch, surfaceKey]);

  // ── Agent execution minimal fetch ────────────────────────────────────────
  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );
  const agentName = useAppSelector((state) => selectAgentName(state, agentId));
  const agent = useAppSelector((state) => selectAgentById(state, agentId));

  const [isInitializing, setIsInitializing] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setIsInitializing(true);
      try {
        if (!executionPayload.isReady) {
          await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
        }
      } catch (err) {
        console.error(
          "[ChatRoomClient] fetchAgentExecutionMinimal failed",
          err,
        );
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch, executionPayload.isReady]);

  // ── Launcher (active only on /chat/a/[agentId]) ──────────────────────────
  // When `conversationIdProp` is set, we're loading an existing conversation
  // so the launcher stays gated off. When absent, it creates a fresh instance
  // and owns the conversationId.
  const { conversationId: liveConversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    ready: !isInitializing && !conversationIdProp,
    config: { responseDensity: "compact" },
  });

  // ── Existing-conversation load (only on /chat/[conversationId]) ──────────
  // One in-flight load at a time, cancelled on prop change.
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationIdProp || isInitializing || !authReady) return;
    if (loadedKeyRef.current === conversationIdProp) return;

    // Cancel any in-flight load before starting a new one.
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    loadedKeyRef.current = conversationIdProp;

    (async () => {
      try {
        const exists =
          !!store.getState().conversations?.byConversationId?.[
            conversationIdProp
          ];
        if (ctrl.signal.aborted) return;
        if (!exists) {
          await dispatch(
            createManualInstance({
              agentId,
              conversationId: conversationIdProp,
              apiEndpointMode: "agent",
              responseDensity: "compact",
            }),
          ).unwrap();
        }
        if (ctrl.signal.aborted) return;
        await dispatch(
          loadConversation({
            conversationId: conversationIdProp,
            surfaceKey,
          }),
        ).unwrap();
      } catch (err) {
        if (loadedKeyRef.current === conversationIdProp) {
          loadedKeyRef.current = null;
        }
        console.error("[ChatRoomClient] loadConversation failed", err);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [
    agentId,
    conversationIdProp,
    dispatch,
    isInitializing,
    authReady,
    store,
    surfaceKey,
  ]);

  // ── Pending navigation → router.replace ─────────────────────────────────
  // After the first user submit on /chat/a/[agentId], the streaming thunk
  // sets pendingNavigation with the new conversationId; this effect promotes
  // the URL so future reloads land on /chat/[conversationId].
  const pendingNavigation = useAppSelector(selectPendingNavigation(surfaceKey));
  useEffect(() => {
    if (!pendingNavigation) return;
    router.replace(`/chat/${pendingNavigation.conversationId}`);
    dispatch(clearPendingNavigation({ surfaceKey }));
  }, [pendingNavigation, router, dispatch, surfaceKey]);

  // ── Single source of truth ───────────────────────────────────────────────
  // Prop wins when present (loading existing). Otherwise launcher's id wins.
  const conversationId = conversationIdProp ?? liveConversationId ?? null;

  const handlePickAgent = (nextAgentId: string) => {
    if (nextAgentId === agentId) return;
    router.push(`/chat/a/${encodeURIComponent(nextAgentId)}`);
  };

  const displayAgentName = agentName || agent?.name || "Loading…";

  if (isInitializing || !conversationId) {
    return (
      <ChatPageShell
        activeConversationId={conversationIdProp}
        activeAgentId={agentId}
        activeAgentName={displayAgentName}
        onAgentSelect={handlePickAgent}
      >
        <ChatRoomSkeleton />
      </ChatPageShell>
    );
  }

  return (
    <ChatPageShell
      activeConversationId={conversationId}
      activeAgentId={agentId}
      activeAgentName={displayAgentName}
      onAgentSelect={handlePickAgent}
    >
      <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
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
    </ChatPageShell>
  );
}
