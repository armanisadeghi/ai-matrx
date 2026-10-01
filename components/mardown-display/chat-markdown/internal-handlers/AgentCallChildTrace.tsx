"use client";

/**
 * AgentCallChildTrace — a sub-agent's thinking and tool calls, drawn in the
 * transcript directly under the `agent_call` card that ran it, live AND after
 * a reload (Arman, 2026-10-01: nested work is shown, never hidden inside the
 * card). Items come from `utils/agent-call-trace.ts` (one list, two sources);
 * each renders through the components the top level uses — `ToolCard` for a
 * call (so a nested `agent_call` brings its own trace: depth by recursion) and
 * the canonical reasoning renderer for thinking. The door opens the child's
 * own conversation.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentCallTrace } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  selectConversationMessages,
  selectMessagesInterleavedRuns,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { loadAgentCallChildConversation } from "@/features/agents/redux/execution-system/thunks/load-agent-call-child.thunk";
import {
  childConversationIdFromResult,
  persistedAgentCallTrace,
  type LiveAgentCallTrace,
} from "@/features/agents/redux/execution-system/utils/agent-call-trace";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { useConversationTitle } from "@/features/agents/hooks/useConversationTitle";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import ReasoningVisualization from "@/components/mardown-display/blocks/thinking-reasoning/ReasoningVisualization";
import { isCollaborationAgentCall } from "@/features/tool-call-visualization/renderers/agent-call/collab";
import { InlineThinkingSlot } from "./InlineThinkingSlot";
import type { ToolCardProps } from "./ToolHandlers";

export interface AgentCallChildTraceProps {
  entry: ToolLifecycleEntry;
  conversationId: string;
  /** Live source — the parent request whose wire carried the child. */
  requestId?: string;
  /** Passed in (not imported) — `ToolCard` renders this trace. */
  ToolCardComponent: React.ComponentType<ToolCardProps>;
}

const NO_LIVE_TRACE = (): LiveAgentCallTrace | null => null;
const NO_MESSAGES = (): MessageRecord[] => [];
const NO_RUNS = () => [];

export function AgentCallChildTrace({
  entry,
  conversationId,
  requestId,
  ToolCardComponent,
}: AgentCallChildTraceProps) {
  const dispatch = useAppDispatch();
  const liveSelector = useMemo(
    () =>
      requestId ? selectAgentCallTrace(requestId, entry.callId) : NO_LIVE_TRACE,
    [requestId, entry.callId],
  );
  const live = useAppSelector(liveSelector);
  const childId =
    live?.childConversationId ?? childConversationIdFromResult(entry.result);

  // Reload (or a stream already gone from the store): the child's own rows.
  const persistedId = !live && childId ? childId : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!persistedId) return;
    dispatch(loadAgentCallChildConversation({ childConversationId: persistedId }))
      .unwrap()
      .then(() => setFailed(false))
      .catch(() => setFailed(true));
  }, [dispatch, persistedId]);
  const messages = useAppSelector(
    persistedId ? selectConversationMessages(persistedId) : NO_MESSAGES,
  );
  const assistantIds = messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.id);
  const idsKey = assistantIds.join(",");
  const runsSelector = useMemo(
    () =>
      persistedId && idsKey
        ? selectMessagesInterleavedRuns(persistedId, idsKey.split(","))
        : NO_RUNS,
    [persistedId, idsKey],
  );
  const runs = useAppSelector(runsSelector);
  const persisted = persistedAgentCallTrace(runs);

  const title = useConversationTitle(childId);
  const showDoor = !!childId && !isCollaborationAgentCall(entry);
  const hasItems = live ? live.items.length > 0 : persisted.length > 0;
  if (!hasItems && !showDoor && !failed) return null;

  return (
    <div
      className="ml-3 mt-1 flex flex-col gap-1 border-l border-border pl-3"
      data-agent-call-trace={entry.callId}
    >
      {live
        ? live.items.map((item) =>
            item.kind === "thinking" ? (
              <InlineThinkingSlot
                key={`thinking-${item.chunkStartIndex}`}
                requestId={requestId ?? ""}
                chunkStartIndex={item.chunkStartIndex}
                chunkEndIndex={item.chunkEndIndex}
                renderReasoning={(content, isStreaming) => (
                  <ReasoningVisualization
                    reasoningText={content}
                    isStreaming={isStreaming}
                  />
                )}
              />
            ) : (
              <ToolCardComponent
                key={`tool-${item.callId}`}
                callId={item.callId}
                requestId={requestId}
                conversationId={conversationId}
              />
            ),
          )
        : persisted.map((item, i) =>
            item.kind === "thinking" ? (
              <ReasoningVisualization
                key={`thinking-${i}`}
                reasoningText={item.content}
              />
            ) : (
              <ToolCardComponent
                key={`tool-${item.segment.callId}`}
                callId={item.segment.callId}
                segment={item.segment}
                conversationId={conversationId}
              />
            ),
          )}
      {failed && (
        <span className="text-xs text-muted-foreground">
          Sub-agent steps unavailable
        </span>
      )}
      {showDoor && (
        <EntityRef
          token="conversation"
          id={childId}
          name={title ?? "Sub-agent conversation"}
          openInNewTab
          showIcon={false}
          labelClassName="text-xs"
          className="self-start"
        />
      )}
    </div>
  );
}
