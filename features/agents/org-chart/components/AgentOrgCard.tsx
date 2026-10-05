// features/agents/org-chart/components/AgentOrgCard.tsx
//
// One box on the org chart — an agent, a person, a team or a position.
// A Conductor shows its Orchestra's accent, how it runs and how many agents it
// directs; an agent shows its role in the Orchestra above it; a person shows
// their avatar; a position shows who fills it (or that it is open). Every box
// opens (No Dead Ends): Quick look in place, or open the record.

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Briefcase, Copy, Lightbulb, Loader2, Network, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { AgentPeekButton } from "@/features/agents/orchestras/components/AgentPeekButton";
import { accentClasses } from "@/features/agents/orchestras/components/accents";
import { ORCHESTRA_MODE_META } from "@/features/agents/orchestras/constants";
import { hasPeek } from "@/features/organizations/peek/kinds-list";
// Already a lazy front door (its implementation loads on first peek) — the same import EntityRef uses.
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import type { PlacedOrgNode } from "@/components/official/org-chart/layout";
import type { OrgChartCardState } from "@/components/official/org-chart/OrgChart";
import type { AgentOrgNodeData } from "../buildAgentOrgForest";
import { ORG_BOX_LABEL } from "../constants";
import { useBoxIdentity } from "../useBoxIdentity";


/** The card hover bar's icon button (same as AgentPeekButton and the Orchestra cards). */
export const cardIconButton =
  "rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** Where a box opens. A position has no page of its own: its menu edits it in place. */
export function boxHref(d: AgentOrgNodeData): string | null {
  switch (d.boxType) {
    case "agent":
      return d.isConductor ? `/agents/orchestras/${d.entityId}` : `/agents/${d.entityId}`;
    case "team":
      return `/teams/id/${encodeURIComponent(d.entityId)}`;
    default:
      return null;
  }
}

function PeekButton({ token, id }: { token: string; id: string }) {
  const [open, setOpen] = useState(false);
  if (!hasPeek(token)) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Quick look"
        title="Quick look"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cardIconButton}
      >
        <Lightbulb className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span onClick={(e) => e.stopPropagation()}>
          <ResourcePeekHost kind={token} id={id} onClose={() => setOpen(false)} />
        </span>
      )}
    </>
  );
}

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
  /** Extra actions (the page's menu). */
  menu?: React.ReactNode;
  /** Not selectable (e.g. a nested box on the Orchestra canvas); its buttons still work. */
  readOnly?: boolean;
}) {
  const d = node.node.data;
  const who = useBoxIdentity(d.boxType, d.entityId);
  const a = accentClasses(d.accent);
  const isAgent = d.boxType === "agent";
  const Icon = d.isConductor
    ? Network
    : d.boxType === "team"
      ? UsersRound
      : d.boxType === "position"
        ? Briefcase
        : AGENT_ICON;
  const name =
    who.name ?? (who.missing ? `${ORG_BOX_LABEL[d.boxType]} not available` : "Loading…");
  const interactive = !readOnly;
  const href = boxHref(d);
  const openLabel = `Open ${d.isConductor ? "Orchestra" : ORG_BOX_LABEL[d.boxType].toLowerCase()}`;

  const subtitle = d.isConductor
    ? [
        "Conductor",
        d.mode ? ORCHESTRA_MODE_META[d.mode].label : null,
        memberCount !== undefined ? `${memberCount} ${memberCount === 1 ? "agent" : "agents"}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : isAgent
      ? d.roleTitle || who.detail || "Agent"
      : [ORG_BOX_LABEL[d.boxType], who.detail].filter(Boolean).join(" · ");

  const footnote = isAgent && who.detail && subtitle !== who.detail ? who.detail : null;

  return (
    <div
      role={interactive ? "button" : "group"}
      data-clickable={interactive ? "" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={name}
      aria-pressed={interactive ? state.selected : undefined}
      onClick={
        interactive
          ? (e) => state.select({ additive: e.shiftKey || e.metaKey || e.ctrlKey })
          : undefined
      }
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          state.select();
        }
      }}
      className={cn(
        "group/card relative flex h-full w-full flex-col rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-[box-shadow,border-color] duration-150",
        interactive && "hover:border-foreground/25 hover:shadow-md",
        d.isConductor ? cn("border-transparent ring-2", a.ring) : "border-border",
        !isAgent && "border-l-4 border-l-foreground/25",
        state.selected && "ring-2 ring-primary shadow-md",
        state.matched && !state.selected && "ring-2 ring-warning",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {who.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a 36px avatar from our own storage; next/image adds nothing here
          <img src={who.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center",
              d.boxType === "membership" ? "rounded-full" : "rounded-lg",
              d.isConductor ? a.glyph : "bg-muted text-foreground/70",
            )}
          >
            {d.pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : d.boxType === "membership" ? (
              <span className="text-xs font-semibold">{initials(who.name)}</span>
            ) : (
              <Icon className="h-4 w-4" />
            )}
          </div>
        )}
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
            title="Also appears elsewhere on the chart"
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
            title="Already sits above itself here, so the chart stops at this box."
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            Loop — shown once above
          </span>
        )}
        {!d.loop && !d.unavailable && d.otherPlacements === 0 && footnote && (
          <span className="line-clamp-1 text-[10px] text-muted-foreground/80">{footnote}</span>
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
        {isAgent ? (
          <AgentPeekButton agentId={d.entityId} />
        ) : d.boxType === "membership" ? (
          who.userId && <PeekButton token="user" id={who.userId} />
        ) : (
          <PeekButton token={d.boxType} id={d.entityId} />
        )}
        {href && (
          <Link href={href} onClick={(e) => e.stopPropagation()} aria-label={openLabel} title={openLabel} className={cardIconButton}>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
        {menu}
      </div>
    </div>
  );
}

function initials(name: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}
