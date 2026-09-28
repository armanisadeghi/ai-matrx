// features/agents/org-chart/components/AgentOrgCard.tsx
//
// One agent's box on the agent org chart. A Conductor shows its Orchestra's
// accent, how it runs and how many agents it directs; any agent shows its role
// in the Orchestra above it. Every box opens (No Dead Ends): Quick look in
// place, or open the agent / the Orchestra it leads.

"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Copy, Loader2, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { AgentPeekButton } from "@/features/agents/orchestras/components/AgentPeekButton";
import { accentClasses } from "@/features/agents/orchestras/components/accents";
import { ORCHESTRA_MODE_META } from "@/features/agents/orchestras/constants";
import type { PlacedOrgNode } from "@/components/official/org-chart/layout";
import type { OrgChartCardState } from "@/components/official/org-chart/OrgChart";
import type { AgentOrgNodeData } from "../buildAgentOrgForest";

export function AgentOrgCard({
  node,
  state,
  memberCount,
  menu,
  readOnly = false,
}: {
  node: PlacedOrgNode<AgentOrgNodeData>;
  state: OrgChartCardState;
  /** Members of this agent's own Orchestra (Conductors only). */
  memberCount?: number;
  /** Extra actions (the page's manual-link menu). */
  menu?: React.ReactNode;
  /** Not selectable (e.g. a nested box on the Orchestra canvas); its buttons still work. */
  readOnly?: boolean;
}) {
  const d = node.node.data;
  const agent = useAppSelector((s) => selectAgentById(s, d.agentId));
  const a = accentClasses(d.accent);
  const Icon = d.isConductor ? Network : AGENT_ICON;
  const name = agent?.name ?? (d.pending ? "Loading…" : "Agent");
  const interactive = !readOnly;
  const href = d.isConductor ? `/agents/orchestras/${d.agentId}` : `/agents/${d.agentId}`;

  const subtitle = d.isConductor
    ? [
        "Conductor",
        d.mode ? ORCHESTRA_MODE_META[d.mode].label : null,
        memberCount !== undefined ? `${memberCount} ${memberCount === 1 ? "agent" : "agents"}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : d.roleTitle || agent?.description || "Agent";

  return (
    <div
      role={interactive ? "button" : "group"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={name}
      aria-pressed={interactive ? state.selected : undefined}
      onClick={interactive ? state.select : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          state.select();
        }
      }}
      className={cn(
        "group/card relative flex h-full w-full flex-col rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-[box-shadow,border-color] duration-150",
        interactive && "cursor-pointer hover:border-foreground/25 hover:shadow-md",
        d.isConductor ? cn("border-transparent ring-2", a.ring) : "border-border",
        state.selected && "ring-2 ring-primary shadow-md",
        state.matched && !state.selected && "ring-2 ring-warning",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            d.isConductor ? a.glyph : "bg-muted text-foreground/70",
          )}
        >
          {d.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-tight text-foreground" title={name}>
            {name}
          </div>
          <div
            className={cn(
              "mt-0.5 truncate text-[11px] leading-tight",
              d.isConductor ? cn("font-medium", a.text) : "text-muted-foreground",
            )}
            title={subtitle}
          >
            {subtitle}
          </div>
        </div>
      </div>

      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-1 pt-1.5">
        {d.otherPlacements > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            title="This agent also appears elsewhere on the chart"
          >
            <Copy className="h-2.5 w-2.5" />
            Also in {d.otherPlacements} more {d.otherPlacements === 1 ? "place" : "places"}
          </span>
        )}
        {d.unavailable && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
            title="This Orchestra could not be loaded — you may not have access, or it was removed."
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            Team couldn&apos;t load
          </span>
        )}
        {d.loop && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
            title="This agent already sits above itself here, so the chart stops at this box."
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            Loop — shown once above
          </span>
        )}
        {!d.loop && d.otherPlacements === 0 && agent?.description && d.roleTitle && (
          <span className="line-clamp-1 text-[10px] text-muted-foreground/80">{agent.description}</span>
        )}
      </div>

      {/* Actions: on hover, and always while selected (touch has no hover). */}
      <div
        data-no-pan
        className={cn(
          "absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-border bg-card opacity-0 shadow-sm transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100",
          state.selected && "opacity-100",
        )}
      >
        <AgentPeekButton agentId={d.agentId} />
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          aria-label={d.isConductor ? "Open Orchestra" : "Open agent"}
          title={d.isConductor ? "Open Orchestra" : "Open agent"}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        {menu}
      </div>
    </div>
  );
}
