"use client";

import React from "react";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Bot, Loader2 } from "lucide-react";
import type {
  SurfaceBoundAgentEntry,
  SurfaceBoundAgentSection,
} from "@/features/surfaces/services/surface-bound-agents.service";

type MenuVariant = "context" | "dropdown";

export interface BoundAgentsMenuSectionProps {
  variant: MenuVariant;
  loading: boolean;
  sections: SurfaceBoundAgentSection[];
  onSelect: (entry: SurfaceBoundAgentEntry) => void;
  disabled?: boolean;
}

export function BoundAgentsMenuSection({
  variant,
  loading,
  sections,
  onSelect,
  disabled = false,
}: BoundAgentsMenuSectionProps) {
  const hasAgents = sections.some((s) => s.agents.length > 0);
  const isDisabled = disabled || (!hasAgents && !loading);

  const Sub = variant === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    variant === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    variant === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const Label = variant === "context" ? ContextMenuLabel : DropdownMenuLabel;

  return (
    <Sub>
      <SubTrigger
        disabled={isDisabled}
        className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
      >
        <Bot className="h-4 w-4 mr-2 text-indigo-500" />
        Bound Agents
        {loading && (
          <Loader2 className="h-3 w-3 animate-spin ml-auto opacity-50" />
        )}
      </SubTrigger>
      <SubContent className="w-64 max-h-[70dvh] overflow-y-auto">
        {loading && !hasAgents ? (
          <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : !hasAgents ? (
          <div className="px-2 py-2 text-xs text-muted-foreground italic">
            No agents bound to this surface
          </div>
        ) : (
          sections.map((section, sectionIdx) => (
            <React.Fragment key={`${section.label}-${sectionIdx}`}>
              {sectionIdx > 0 && (
                <div className="my-1 border-t border-border" role="separator" />
              )}
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">
                {section.label.toUpperCase()}
              </Label>
              {section.agents.map((agent) => (
                <Item
                  key={`${section.label}:${agent.agentId}`}
                  onSelect={() => onSelect(agent)}
                >
                  <Bot className="h-4 w-4 mr-2 text-indigo-500/80" />
                  <span className="truncate">{agent.name}</span>
                </Item>
              ))}
            </React.Fragment>
          ))
        )}
      </SubContent>
    </Sub>
  );
}
