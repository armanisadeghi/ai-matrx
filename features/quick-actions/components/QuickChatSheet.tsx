// features/quick-actions/components/QuickChatSheet.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquarePlus, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useSidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ChatHistorySidebar } from "@/features/agents/components/chat/ChatHistorySidebar";
import { ChatRoomSkeleton } from "@/features/agents/components/chat/ChatRoomSkeleton";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { DEFAULT_NEW_CHAT_AGENT_ID } from "@/features/agents/components/chat/chat-quick-actions.config";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import {
  registerSurface,
  unregisterSurface,
} from "@/features/agents/redux/surfaces/surfaces.slice";
import { clearFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

interface QuickChatSheetProps {
  className?: string;
}

const SOURCE_FEATURE = "quick-chat";
const HISTORY_SCOPE = "quick-chat";
/** Registry key for fork/retry routing — distinct from per-conversation focus keys. */
const QUICK_CHAT_PANEL_SURFACE = "quick-chat:panel";

function liveSurfaceKey(agentId: string, session: number): string {
  return `quick-chat:live:${agentId}:${session}`;
}

function loadedSurfaceKey(conversationId: string): string {
  return `quick-chat:loaded:${conversationId}`;
}

/**
 * QuickChatSheet — pop-over chat that mirrors the live `/chat` route.
 *
 * Like `/chat`, it is agent-first: a compact agent picker switches the active
 * agent (starting a fresh conversation with it), the transcript + input are the
 * route's own `AgentConversationColumn` (centered), and an optional history
 * sidebar lets you jump to any past conversation.
 *
 * Two conversation modes share one column:
 *  - **live** — `useAgentLauncher(agentId)` owns a fresh conversation. Switching
 *    agent or hitting "New chat" bumps `session`, minting a new surface key so
 *    the launcher starts a brand-new conversation.
 *  - **loaded** — a history row was clicked; we hydrate that conversation and
 *    render it. "New chat" returns to live mode.
 *
 * Rendered as bare content — surrounding chrome (the side panel header / the
 * Utilities Hub tab) is supplied by the consumer.
 */
export function QuickChatSheet({ className }: QuickChatSheetProps) {
  const dispatch = useAppDispatch();

  const [agentId, setAgentId] = useState<string>(DEFAULT_NEW_CHAT_AGENT_ID);
  const [session, setSession] = useState(0);
  const [loadedConversationId, setLoadedConversationId] = useState<
    string | null
  >(null);
  const [showHistory, setShowHistory] = useState(false);

  const agentName = useAppSelector((state) => selectAgentName(state, agentId));

  const loadAbortRef = useRef<AbortController | null>(null);
  const activeSurfaceKeyRef = useRef<string | null>(null);

  // Opening the history sidebar should GROW the panel (push its left edge into
  // the page) rather than eat the chat's width — when there's room. The width
  // boost is released when the sidebar closes or the panel unmounts.
  const surface = useSidePanelSurface();
  const HISTORY_WIDTH = 256;
  useEffect(() => {
    surface?.requestWidthBoost(showHistory ? HISTORY_WIDTH : 0);
    return () => surface?.requestWidthBoost(0);
  }, [showHistory, surface]);

  // Register as a widget surface so fork/retry/navigation intents stay scoped
  // to Quick Chat and never bleed into the `/chat` page surface.
  useEffect(() => {
    dispatch(
      registerSurface({
        surfaceKey: QUICK_CHAT_PANEL_SURFACE,
        kind: "widget",
      }),
    );
    return () => {
      dispatch(unregisterSurface(QUICK_CHAT_PANEL_SURFACE));
      const key = activeSurfaceKeyRef.current;
      if (key) dispatch(clearFocus(key));
    };
  }, [dispatch]);

  // Live launcher — gated off while viewing a loaded (history) conversation.
  // The surface key carries `session` so "New chat" / agent-switch always mints
  // a fresh conversation rather than reviving the previous one.
  const currentLiveSurfaceKey = liveSurfaceKey(agentId, session);
  const { conversationId: liveConversationId } = useAgentLauncher(agentId, {
    surfaceKey: currentLiveSurfaceKey,
    sourceFeature: SOURCE_FEATURE,
    ready: !loadedConversationId,
    config: { responseDensity: "compact" },
  });

  const isLoaded = !!loadedConversationId;
  const conversationId = loadedConversationId ?? liveConversationId ?? null;
  const surfaceKey = isLoaded
    ? loadedSurfaceKey(loadedConversationId)
    : currentLiveSurfaceKey;

  activeSurfaceKeyRef.current = surfaceKey;

  // Drop the cursor straight into the message box once the conversation is
  // ready — the user came here to type, not to click. The input renders a beat
  // after the conversation id resolves (the column shows a skeleton first), so
  // poll briefly for the textarea instead of focusing once and missing it.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!conversationId) return undefined;
    let tries = 0;
    const id = window.setInterval(() => {
      const ta =
        bodyRef.current?.querySelector<HTMLTextAreaElement>("textarea");
      if (ta) {
        ta.focus();
        window.clearInterval(id);
      } else if (++tries > 25) {
        window.clearInterval(id);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [conversationId]);

  const handleNewChat = useCallback(() => {
    loadAbortRef.current?.abort();
    setLoadedConversationId(null);
    setSession((s) => s + 1);
  }, []);

  const handleSelectAgent = useCallback(
    (id: string) => {
      if (id === agentId && !loadedConversationId) return;
      loadAbortRef.current?.abort();
      setLoadedConversationId(null);
      setAgentId(id);
      setSession((s) => s + 1);
    },
    [agentId, loadedConversationId],
  );

  const handleOpenConversation = useCallback(
    async (conv: ConversationListItem) => {
      const targetSurfaceKey = loadedSurfaceKey(conv.conversationId);

      loadAbortRef.current?.abort();
      const ctrl = new AbortController();
      loadAbortRef.current = ctrl;

      try {
        if (conv.agentId) {
          setAgentId(conv.agentId);
          await dispatch(
            createManualInstance({
              agentId: conv.agentId,
              conversationId: conv.conversationId,
              apiEndpointMode: "agent",
              responseDensity: "compact",
              sourceFeature: SOURCE_FEATURE,
            }),
          )
            .unwrap()
            .catch(() => {
              /* instance may already exist — loadConversation handles it */
            });
        }

        if (ctrl.signal.aborted) return;

        await dispatch(
          loadConversation({
            conversationId: conv.conversationId,
            surfaceKey: targetSurfaceKey,
            signal: ctrl.signal,
          }),
        ).unwrap();

        if (ctrl.signal.aborted) return;

        setLoadedConversationId(conv.conversationId);
        // Keep the history sidebar open — closing it felt like a full panel reset.
      } catch (error) {
        if (ctrl.signal.aborted) return;
        console.error("[QuickChatSheet] Failed to open conversation:", error);
      }
    },
    [dispatch],
  );

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {/* Agent-first control row — picker + history toggle + new chat. */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showHistory ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setShowHistory((v) => !v)}
                aria-label="Toggle conversation history"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Conversations</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex min-w-0 flex-1 items-center">
          <AgentListDropdown
            onSelect={handleSelectAgent}
            label={agentName?.trim() || "Select an agent"}
            compact
            noBorder
          />
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={handleNewChat}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                New chat
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start a fresh conversation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Body: optional history sidebar + centered conversation column. */}
      <div ref={bodyRef} className="flex min-h-0 flex-1">
        {showHistory && (
          <div className="w-64 shrink-0 border-r border-border">
            <ChatHistorySidebar
              scopeId={HISTORY_SCOPE}
              surfaceId="chat"
              activeConversationId={conversationId}
              onOpenConversation={handleOpenConversation}
              openInPlace
              excludeSourceFeatures={["voice-agent"]}
            />
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {conversationId ? (
            <div className="flex min-h-0 flex-1 overflow-hidden justify-center">
              <AgentConversationColumn
                conversationId={conversationId}
                surfaceKey={surfaceKey}
                constrainWidth
                edgeToEdgeScroll
                smartInputProps={{
                  sendButtonVariant: "blue",
                  showSubmitOnEnterToggle: false,
                }}
              />
            </div>
          ) : (
            <ChatRoomSkeleton />
          )}
        </div>
      </div>
    </div>
  );
}
