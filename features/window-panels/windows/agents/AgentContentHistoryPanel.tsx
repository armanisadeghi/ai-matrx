"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, History, SquareStack } from "lucide-react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  AgentVersionGroupedList,
  useAgentConversationList,
} from "@ai-matrx/chat/agents/components/conversation-history/AgentConversationList";
import { AgentConversationDisplay } from "@ai-matrx/chat/agents/components/messages-display/AgentConversationDisplay";
import { loadConversation } from "@ai-matrx/chat/agents/redux/execution-system/thunks/load-conversation.thunk";
import { followWhatIsStillInFlight } from "@ai-matrx/chat/agents/runtime-reconnect/follow-what-is-still-in-flight";
import { createManualInstance } from "@ai-matrx/chat/agents/redux/execution-system/thunks/create-instance.thunk";
import type { RootState } from "@/lib/redux/store";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const SURFACE_KEY = "agent-advanced-editor-history-tab";

interface AgentContentHistoryPanelProps {
  /** Initial agent whose history to show. May be changed by the in-panel picker. */
  agentId: string;
  /**
   * Render an agent picker above the conversation list so the user can browse
   * a different agent's history without leaving the panel. Default `true` —
   * pass `false` to lock the panel to `agentId` (rare; useful when the host
   * already owns the agent picker).
   */
  allowAgentSwitching?: boolean;
  /**
   * Optional. Called when the user picks a different agent from the dropdown.
   * If omitted, the panel manages the selected agent in internal state — i.e.
   * the embedded History tab can switch agents without coordinating with its
   * parent.
   */
  onAgentChange?: (agentId: string) => void;
}

export function AgentContentHistoryPanel({
  agentId: initialAgentId,
  allowAgentSwitching = true,
  onAgentChange,
}: AgentContentHistoryPanelProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  // When the caller provides `onAgentChange`, treat it as controlled — the
  // displayed agent always tracks `initialAgentId`. Otherwise manage it
  // ourselves so the embedded History tab can switch agents independently
  // from its host editor.
  const [internalAgentId, setInternalAgentId] = useState(initialAgentId);
  const agentId = onAgentChange ? initialAgentId : internalAgentId;

  // Keep internal state in sync if the caller flips the initial id (e.g. user
  // switches agents in the host editor before the History tab tracks its own).
  useEffect(() => {
    if (!onAgentChange) setInternalAgentId(initialAgentId);
  }, [initialAgentId, onAgentChange]);

  const handleAgentSelect = useCallback(
    (next: string) => {
      if (onAgentChange) onAgentChange(next);
      else setInternalAgentId(next);
      setSelectedConversationId(null);
    },
    [onAgentChange],
  );

  const list = useAgentConversationList(agentId);
  const { agentName, status, error, conversations, archived } = list;

  const handleSelect = useCallback(
    async (conversationId: string) => {
      setSelectedConversationId(conversationId);

      const exists = !!(store.getState() as RootState).conversations
        ?.byConversationId?.[conversationId];

      if (!exists) {
        await dispatch(
          createManualInstance({
            agentId,
            conversationId,
            apiEndpointMode: "agent",
          }),
        );
      }

      await dispatch(
        loadConversation({
          conversationId,
          surfaceKey: SURFACE_KEY,
        }),
      );
      // The picked run may still be answering on the server — rejoin it.
      followWhatIsStillInFlight(dispatch, conversationId);
    },
    [agentId, dispatch, store],
  );

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0 w-full"
    >
      <ResizablePanel
        id="agent-content-history-sidebar"
        defaultSize="28%"
        minSize="8%"
        maxSize="45%"
      >
        <div className="h-full min-h-0 flex flex-col border-r border-border bg-card/30">
          {allowAgentSwitching && (
            <div className="px-2 py-1.5 border-b border-border shrink-0">
              <AgentListDropdown
                onSelect={handleAgentSelect}
                label={agentName ?? "Select agent…"}
                className="w-full"
              />
            </div>
          )}
          <div className="px-2 py-1 border-b border-border/50 shrink-0 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Conversations
            </span>
            {status === "loading" && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {status === "failed" && (
              <p className="px-3 py-2 text-[10px] text-destructive">
                {error ?? "Failed to load"}
                <ErrorAlchemyMenu error={error} />
              </p>
            )}

            {status === "succeeded" &&
              conversations.length === 0 &&
              archived.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
                <History className="w-6 h-6 text-muted-foreground mb-2 opacity-40" />
                <p className="text-xs text-muted-foreground">
                  No conversations yet
                </p>
              </div>
            )}

            <AgentVersionGroupedList
              agentId={agentId}
              list={list}
              selectedId={selectedConversationId}
              onSelect={handleSelect}
              sourceFeature="agents-other"
            />
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel
        id="agent-content-history-main"
        defaultSize="72%"
        minSize="30%"
      >
        <div className="h-full min-h-0 overflow-hidden">
          {selectedConversationId ? (
            <div className="h-full w-full overflow-y-auto">
              <div className="mx-auto max-w-3xl w-full p-3">
                <AgentConversationDisplay
                  conversationId={selectedConversationId}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 text-muted-foreground">
              <SquareStack className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="text-xs opacity-60 mt-1">
                Choose a run to view its conversation (read-only)
              </p>
            </div>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
