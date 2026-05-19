"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFavoriteAgents } from "@/features/agents/redux/agent-definition/selectors";
import { FavoriteAgentButton } from "@/features/agents/components/agent-listings/FavoriteAgentButton";

interface PinnedAgentsSectionProps {
  /** Currently active agentId — used to highlight the row when present. */
  activeAgentId?: string;
  /** Click handler — receives the selected agent's id. */
  onSelect: (agentId: string) => void;
}

/**
 * Renders the user's pinned ("favorite") agents at the top of the chat sidebar.
 *
 * Reuses `agx_agent.is_favorite` — the same column that powers the agents
 * grid's amber star. No new schema, no new slice; we just filter the registry.
 *
 * Hidden entirely when the user has zero pinned agents — no empty-state
 * placeholder cluttering the sidebar.
 */
export function PinnedAgentsSection({
  activeAgentId,
  onSelect,
}: PinnedAgentsSectionProps) {
  const pinned = useAppSelector(selectFavoriteAgents);
  const [open, setOpen] = useState(true);

  if (pinned.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        aria-label="Toggle pinned agents"
      >
        <span className="flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span>Pinned</span>
          <span className="text-[10px] text-muted-foreground/70 normal-case tracking-normal">
            {pinned.length}
          </span>
        </span>
      </button>
      {open && (
        <ul className="pb-1.5">
          {pinned.map((agent) => {
            const isActive = activeAgentId === agent.id;
            return (
              <li key={agent.id}>
                <button
                  type="button"
                  onClick={() => onSelect(agent.id)}
                  className={cn(
                    "group w-full flex items-center gap-2 px-2 py-1 text-left text-xs",
                    "text-foreground/90 hover:bg-accent/60",
                    isActive && "bg-accent/70",
                  )}
                  title={agent.description || agent.name}
                >
                  <Network
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {agent.name || "Untitled agent"}
                  </span>
                  <span
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FavoriteAgentButton id={agent.id} variant="list" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
