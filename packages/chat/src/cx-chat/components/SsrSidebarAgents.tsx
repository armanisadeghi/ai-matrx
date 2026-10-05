"use client";

// The demo chat sidebar used to maintain its own three-section agent roster.
// Agent selection now stays on the same canonical picker as the Chat header;
// this component is only the narrow sidebar trigger/compatibility adapter.

import { ChevronDown, Network } from "lucide-react";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { Tile } from "@ai-matrx/design-system/controls";

interface SidebarAgent {
  promptId: string;
  name: string;
}

interface SsrSidebarAgentsProps {
  selectedAgent?: SidebarAgent | null;
  onAgentSelect?: (agent: { promptId: string }) => void;
  searchQuery?: string;
}

export function SsrSidebarAgents({
  selectedAgent,
  onAgentSelect,
}: SsrSidebarAgentsProps) {
  return (
    <div className="border-b border-border px-1 py-1">
      <AgentListDropdown
        consumerId="cx-chat-sidebar-agent-picker"
        activeAgentId={selectedAgent?.promptId ?? null}
        label={selectedAgent?.name ?? "Browse agents"}
        onSelect={(agentId) => onAgentSelect?.({ promptId: agentId })}
        resolveAgentHref={(agent) => `/demos/chat/a/${agent.id}`}
        contentSide="right"
        triggerSlot={
          <Tile variant="quiet" icon={<Network />} title={selectedAgent?.name ?? "Browse agents"} end={<ChevronDown />} />
        }
      />
    </div>
  );
}
