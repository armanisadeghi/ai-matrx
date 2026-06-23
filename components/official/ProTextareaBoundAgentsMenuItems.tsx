"use client";

import { Bot, Loader2 } from "lucide-react";
import type {
  SurfaceBoundAgentEntry,
  SurfaceBoundAgentSection,
} from "@/features/surfaces/services/surface-bound-agents.service";

export interface ProTextareaBoundAgentsMenuItemsProps {
  loading: boolean;
  sections: SurfaceBoundAgentSection[];
  onSelect: (entry: SurfaceBoundAgentEntry) => void;
}

/**
 * Grouped bound-agent rows for the ProTextarea "…" popover — mirrors the
 * context menu Bound Agents sections (My agents / System / Shared / org).
 */
export function ProTextareaBoundAgentsMenuItems({
  loading,
  sections,
  onSelect,
}: ProTextareaBoundAgentsMenuItemsProps) {
  const hasAgents = sections.some((s) => s.agents.length > 0);

  if (loading && !hasAgents) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground border-t border-border">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading bound agents…
      </div>
    );
  }

  if (!hasAgents) return null;

  return (
    <div className="border-t border-border pt-1">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Bound agents
      </div>
      {sections.map((section, sectionIdx) => (
        <div key={`${section.label}-${sectionIdx}`}>
          {sectionIdx > 0 && (
            <div className="mx-2 my-1 border-t border-border/60" />
          )}
          <div className="px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
            {section.label}
          </div>
          {section.agents.map((agent) => (
            <button
              key={`${section.label}:${agent.agentId}`}
              type="button"
              onClick={() => onSelect(agent)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Bot className="h-4 w-4 shrink-0 text-indigo-500/80" />
              <span className="truncate">{agent.name}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
