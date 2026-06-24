"use client";

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useAgentLauncher } from "../../hooks/useAgentLauncher";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { selectInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { AgentRunner } from "./AgentRunner";

interface AgentRunWrapperProps {
  agentId: string;
  sourceFeature: SourceFeature;
  /**
   * Fired once each time a run finishes successfully (status transitions from
   * running/streaming → "complete"). Use it to react to side effects the agent
   * performed server-side — e.g. refetch a list the agent just wrote to.
   */
  onRunComplete?: () => void;
}

export function AgentRunWrapper({
  agentId,
  sourceFeature,
  onRunComplete,
}: AgentRunWrapperProps) {
  const surfaceKey = `${sourceFeature}:${agentId}`;

  if (typeof window !== "undefined") {
    console.log(`[Track AgentRunWrapper Render] surfaceKey=${surfaceKey}`);
  }

  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature,
    apiEndpointMode: "agent",
    autoClearConversation: false,
    config: {
      autoRun: false,
      allowChat: true,
      showVariablePanel: true,
      showDefinitionMessages: true,
      showDefinitionMessageContent: true,
      showPreExecutionGate: false,
    },
  });

  // Fire `onRunComplete` on the running/streaming → "complete" edge. The agent
  // writes directly to the DB server-side, so consumers can only learn the work
  // is done by watching the run reach a terminal success status.
  const status = useAppSelector(
    conversationId ? selectInstanceStatus(conversationId) : () => undefined,
  );
  const prevStatusRef = useRef<typeof status>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!onRunComplete) return;
    if (status === "complete" && (prev === "running" || prev === "streaming")) {
      onRunComplete();
    }
  }, [status, onRunComplete]);

  return (
    <AgentRunner conversationId={conversationId} surfaceKey={surfaceKey} />
  );
}
