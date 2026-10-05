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
import { Button } from "@ai-matrx/design-system/controls";
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
import { useAgentActivity, type AgentActivity } from "../useOrgChartActivity";
import { formatRelativeTime } from "@ai-matrx/kit/format";

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
      <Button
        variant="quiet"
        icon={<Lightbulb />}
        aria-label="Quick look"
        title="Quick look"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      />
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
  spreadWarnAt = null,
}: {
  node: PlacedOrgNode<AgentOrgNodeData>;
  state: OrgChartCardState;
  /** Members of this agent's own Orchestra (Conductors only). */
  memberCount?: number;
  /** Extra actions (the page's menu). */
  menu?: React.ReactNode;
  /** Not selectable (e.g. a nested box on the Orchestra canvas); its buttons still work. */
  readOnly?: boolean;
  /** Placements at which "also in N places" turns into a warning (knob). */
  spreadWarnAt?: number | null;
}) {
  const d = node.node.data;
  const who = useBoxIdentity(d.boxType, d.entityId);
  const a = accentClasses(d.accent);
  const activity = useAgentActivity(d.boxType === "agent" ? d.entityId : null);
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
        activity?.state === "running" && !state.selected && "ring-2 ring-success/60",
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
            data-matrx-pill="off" // an avatar circle, not a label capsule
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
        {activity && <ActivityBadge activity={activity} />}
        {d.otherPlacements > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              spreadWarnAt !== null && d.otherPlacements + 1 >= spreadWarnAt
                ? "bg-warning/15 text-warning"
                : "bg-muted text-muted-foreground",
            )}
            title={
              spreadWarnAt !== null && d.otherPlacements + 1 >= spreadWarnAt
                ? `Spread thin: on ${d.otherPlacements + 1} teams`
                : "Also appears elsewhere on the chart"
            }
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
        {!activity && !d.loop && !d.unavailable && d.otherPlacements === 0 && footnote && (
          <span className="line-clamp-1 text-[10px] text-muted-foreground/80">{footnote}</span>
        )}
      </div>

      {/* Actions: on hover, and always while selected (touch has no hover). */}
      <div
        data-no-pan
        className={cn(
          "absolute right-1.5 top-1.5 flex items-center rounded-md border border-border bg-card opacity-0 shadow-sm transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100",
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
          <Button variant="quiet" icon={<ArrowUpRight />} asChild>
            <Link href={href} onClick={(e) => e.stopPropagation()} aria-label={openLabel} title={openLabel} />
          </Button>
        )}
        {menu}
      </div>
    </div>
  );
}

const ACTIVITY_STYLE: Record<AgentActivity["state"], { dot: string; chip: string; label: string }> = {
  running: { dot: "bg-success animate-pulse", chip: "bg-success/15 text-success", label: "Running" },
  stalled: { dot: "bg-warning", chip: "bg-warning/15 text-warning", label: "Stalled" },
  done: { dot: "bg-muted-foreground/60", chip: "bg-muted text-muted-foreground", label: "Done" },
  failed: { dot: "bg-destructive", chip: "bg-destructive/10 text-destructive", label: "Failed" },
  stopped: { dot: "bg-muted-foreground/60", chip: "bg-muted text-muted-foreground", label: "Stopped" },
};

function ActivityBadge({ activity }: { activity: AgentActivity }) {
  const s = ACTIVITY_STYLE[activity.state];
  const when = formatRelativeTime(activity.at);
  const text =
    activity.state === "running"
      ? activity.running > 1
        ? `Running ×${activity.running}`
        : "Running"
      : `${s.label} ${when}`;
  const title =
    activity.state === "running"
      ? `Last activity ${when}`
      : activity.state === "stalled"
        ? `Still marked running, no activity since ${when}`
        : `Last run ${s.label.toLowerCase()} ${when}`;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", s.chip)}
      title={title}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {text}
    </span>
  );
}

function initials(name: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}
