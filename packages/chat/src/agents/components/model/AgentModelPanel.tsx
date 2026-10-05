"use client";

import { AgentSettingsCore } from "@ai-matrx/chat/host/ui-slots";

export interface AgentModelPanelProps {
  agentId: string;
}

export function AgentModelPanel({ agentId }: AgentModelPanelProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-hidden px-4">
        <AgentSettingsCore agentId={agentId} />
      </div>
    </div>
  );
}
