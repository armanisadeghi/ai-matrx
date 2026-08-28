"use client";

/**
 * AgentBindingCompact
 *
 * Shows the currently bound agent's name with a small "Change" button.
 * Clicking Change opens the canonical agent picker. Picking a different agent
 * fires `onChange(agentId)` and closes the picker.
 *
 * Apps almost never change agents — apps are built FROM agents. The UI
 * should reflect that: the binding is one row, not a sprawling section.
 */

import { Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";

const BINDABLE_AGENT_TABS = ["mine", "shared", "all"] as const;

interface AgentBindingCompactProps {
  agentId: string;
  agentName?: string | null;
  onChange: (agentId: string) => void;
  disabled?: boolean;
}

export function AgentBindingCompact({
  agentId,
  agentName,
  onChange,
  disabled,
}: AgentBindingCompactProps) {
  const handlePick = (id: string) => {
    if (id === agentId) return;
    onChange(id);
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/30 border border-border/60">
      <div className="flex items-center gap-2 min-w-0">
        <Webhook className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">
          {agentName ?? agentId}
        </span>
      </div>
      <AgentListDropdown
        consumerId="agent-app-binding-picker"
        onSelect={handlePick}
        activeAgentId={agentId}
        visibleTabs={BINDABLE_AGENT_TABS}
        triggerSlot={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 px-3 text-xs sm:h-7 sm:px-2"
            disabled={disabled}
          >
            Change
          </Button>
        }
      />
    </div>
  );
}
