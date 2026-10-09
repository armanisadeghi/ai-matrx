"use client";

/**
 * AgentRunnerColumn — the middle column.
 *
 * Top bar: current agent label (read-only — "this conversation is running agent X").
 * Body:    `<AgentRunner conversationId={...} />` — handles conversation
 *          display + variable panel + SmartAgentInput + auto-run.
 *
 * If there's no active conversation, shows an empty state.
 */

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { AgentRunner } from "@ai-matrx/chat/agents/components/smart/AgentRunner";
import { Hammer } from "lucide-react";
import { SMART_CODE_EDITOR_SURFACE_KEY } from "../../constants";
import { useAgentName } from "@ai-matrx/chat/agents/identity/agent-identity";

interface AgentRunnerColumnProps {
  conversationId: string | null;
  /** Agent id driving the active conversation (for label). */
  activeAgentId: string | null;
}

export function AgentRunnerColumn({
  conversationId,
  activeAgentId,
}: AgentRunnerColumnProps) {
  const agentName = useAgentName(activeAgentId) ?? null;

  if (!conversationId) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-background border-r border-border items-center justify-center text-center p-6">
        <Hammer className="w-6 h-6 text-muted-foreground mb-2" />
        <p className="text-xs font-medium text-foreground">
          No active conversation
        </p>
        <p className="text-[10px] text-muted-foreground mt-1 max-w-[220px]">
          Pick an agent in the history panel and click "New" to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background border-r border-border">
      <div className="shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-1.5">
        <Hammer className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] font-medium truncate">
          {agentName ?? "Agent"}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <AgentRunner
          conversationId={conversationId}
          surfaceKey={SMART_CODE_EDITOR_SURFACE_KEY}
          compact
        />
      </div>
    </div>
  );
}
