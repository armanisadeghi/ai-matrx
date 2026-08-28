"use client";

// The demo chat sidebar used to maintain its own three-section agent roster.
// Agent selection now stays on the same canonical picker as the Chat header;
// this component is only the narrow sidebar trigger/compatibility adapter.

import { ChevronDown, Network } from "lucide-react";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";

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
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground/80 transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {selectedAgent?.name ?? "Browse agents"}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        }
      />
    </div>
  );
}
