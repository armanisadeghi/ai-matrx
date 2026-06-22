"use client";

// features/war-room/components/shared/WarRoomAgentSelector.tsx
//
// The agent picker for the War Room ROOM and MASTER tiers. It makes the active
// agent VISIBLE and SWAPPABLE — the tier no longer applies a default agent
// invisibly. Shows the current agent's name and, via the shared
// `AgentListDropdown`, lets the user switch to any other agent (the tier hook
// persists the choice per scope and resumes that agent's own conversation).
//
// The TILE tier already has this affordance through Scribe's `AssistantAgentBar`;
// this is the equivalent for the two header-only panels (RoomAgentPanel /
// MasterAgentPanel), which previously rendered a static, unchangeable title.

import { useEffect } from "react";
import { Webhook } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";

interface WarRoomAgentSelectorProps {
  /** The active agent id — null while the conversation is still resolving. */
  agentId: string | null;
  /** Switch the tier to another agent. */
  onSwitch: (agentId: string) => void;
  /** Label shown until the agent definition has loaded its name. */
  fallbackLabel: string;
}

export function WarRoomAgentSelector({
  agentId,
  onSwitch,
  fallbackLabel,
}: WarRoomAgentSelectorProps) {
  const dispatch = useAppDispatch();
  const agentName = useAppSelector((s) =>
    agentId ? selectAgentById(s, agentId)?.name : undefined,
  );

  // Ensure the full agent list (owned + shared + builtins, incl. the War Room
  // personas) is loaded so the active agent's NAME resolves immediately — the
  // tier no longer shows an unnamed default. TTL-guarded, safe on every mount.
  useEffect(() => {
    void dispatch(initializeChatAgents());
  }, [dispatch]);

  return (
    <AgentListDropdown
      onSelect={onSwitch}
      compact
      triggerSlot={
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-left transition-colors active:bg-accent"
          title="Change the agent"
        >
          <Webhook className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">
            {agentName ?? fallbackLabel}
          </span>
        </button>
      }
    />
  );
}
