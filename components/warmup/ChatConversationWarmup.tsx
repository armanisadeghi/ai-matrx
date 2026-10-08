"use client";

import { useEffect, useRef } from "react";
import { useWarmOnMount, useWarmup } from "@ai-matrx/agents/react";
import { useAppSelector } from "@/lib/redux/hooks";

/**
 * Warm-up for `/chat/[conversationId]`: the conversation (and the agent the
 * server page resolved) on landing; and when the person switches this chat to
 * another agent, the new agent with reason `agent_change`. Renders nothing.
 */
export function ChatConversationWarmup({
  conversationId,
  agentId,
}: {
  conversationId: string;
  agentId: string | null;
}) {
  useWarmOnMount(
    [
      { key: "conversation", id: conversationId },
      { key: "agent", id: agentId ?? undefined },
    ],
    "route",
  );

  const warmup = useWarmup();
  const liveAgentId = useAppSelector(
    (state) =>
      (
        state as unknown as {
          conversations?: {
            byConversationId?: Record<string, { agentId?: string } | undefined>;
          };
        }
      ).conversations?.byConversationId?.[conversationId]?.agentId ?? null,
  );
  const warmedAgent = useRef<string | null>(agentId);
  useEffect(() => {
    if (!warmup || !liveAgentId || liveAgentId === warmedAgent.current) return;
    warmedAgent.current = liveAgentId;
    warmup.warm([{ key: "agent", id: liveAgentId }], "agent_change");
  }, [warmup, liveAgentId]);

  return null;
}
