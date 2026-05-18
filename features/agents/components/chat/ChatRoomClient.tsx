"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAgentExecutionPayload,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
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

interface ChatRoomClientProps {
  agentId: string;
  /** When provided, loads this existing conversation instead of creating a new one. */
  conversationId?: string;
}

const SOURCE_FEATURE = "chat-route";

export function ChatRoomClient({
  agentId,
  conversationId: conversationIdProp,
}: ChatRoomClientProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();

  const surfaceKey = `${SOURCE_FEATURE}:${agentId}`;

  // Register this client as a `page` surface so action bars can route
  // fork / retry navigation outcomes correctly (URL change). The
  // chat route lives at /chat/[conversationId]; the pendingNavigation
  // effect below handles the actual `router.replace` when an action
  // dispatches a navigation intent.
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

  const pendingNavigation = useAppSelector(selectPendingNavigation(surfaceKey));
  useEffect(() => {
    if (!pendingNavigation) return;
    router.replace(`/chat/${pendingNavigation.conversationId}`);
    dispatch(clearPendingNavigation({ surfaceKey }));
  }, [pendingNavigation, router, dispatch, surfaceKey]);

  const [isInitializing, setIsInitializing] = useState(true);
  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );
  const agentName = useAppSelector((state) => selectAgentName(state, agentId));
  const agent = useAppSelector((state) => selectAgentById(state, agentId));

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

  const { conversationId: liveConversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    ready: !isInitializing && !conversationIdProp,
    config: { responseDensity: "compact" },
  });

  const [resolvedCid, setResolvedCid] = useState<string | null>(
    conversationIdProp ?? null,
  );

  useEffect(() => {
    if (conversationIdProp) {
      setResolvedCid(conversationIdProp);
    } else {
      setResolvedCid(liveConversationId ?? null);
    }
  }, [liveConversationId, conversationIdProp]);

  const lastLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationIdProp) {
      lastLoadedRef.current = null;
      return;
    }
    if (isInitializing) return;
    if (lastLoadedRef.current === conversationIdProp) return;
    lastLoadedRef.current = conversationIdProp;

    (async () => {
      const state = store.getState();
      const exists =
        !!state.conversations?.byConversationId?.[conversationIdProp];
      try {
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
        await dispatch(
          loadConversation({
            conversationId: conversationIdProp,
            surfaceKey,
          }),
        ).unwrap();
        setResolvedCid(conversationIdProp);
      } catch (err) {
        console.error("[ChatRoomClient] loadConversation failed", err);
      }
    })();
  }, [
    agentId,
    conversationIdProp,
    dispatch,
    isInitializing,
    store,
    surfaceKey,
  ]);

  const handlePickAgent = (nextAgentId: string) => {
    if (nextAgentId === agentId) return;
    router.push(`/chat/new?agentId=${encodeURIComponent(nextAgentId)}`);
  };

  if (isInitializing || !resolvedCid) {
    return (
      <ChatPageShell
        activeConversationId={conversationIdProp}
        activeAgentId={agentId}
        activeAgentName={agentName || agent?.name || "Loading..."}
        onAgentSelect={handlePickAgent}
      >
        <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm">Loading chat...</span>
        </div>
      </ChatPageShell>
    );
  }

  return (
    <ChatPageShell
      activeConversationId={resolvedCid}
      activeAgentId={agentId}
      activeAgentName={agentName || agent?.name}
      onAgentSelect={handlePickAgent}
    >
      <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
        <AgentConversationColumn
          conversationId={resolvedCid}
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
