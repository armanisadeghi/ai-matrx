// features/agents/agent-sets/components/AgentRoleCard.tsx
//
// The rich "what this agent does INSIDE the set" card. Built from the agent's
// own name/description/category/tags, overlaid with the user-authored role title
// (stored in the association's `label`) + gap. Reused as a React Flow node body
// and a grid tile via `variant`.
//
// Layout rules learned from v1: the name gets the whole first row (no competing
// glyph — every agent looked identical); actions float top-right on hover over a
// backdrop so they never steal name width; the description expands in place.

"use client";

import { useState } from "react";
import { ChevronDown, GripVertical, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { accentClasses } from "./accents";
import { AgentPeekButton } from "./AgentPeekButton";
import type { SetAccent } from "../constants";

export interface AgentRoleCardProps {
  agentId: string;
  /** Authored role title within the set (from the edge `label`). Falls back to category. */
  roleTitle?: string | null;
  /** Authored "gap this fills". Falls back to the agent's description. */
  gap?: string | null;
  accent?: SetAccent;
  /** 1-based ordinal shown as a "Step N" chip. */
  index?: number;
  variant?: "node" | "tile";
  onRemove?: () => void;
  onEdit?: () => void;
  /** Ordered ids for the peek modal's prev/next. */
  peekNavIds?: string[];
  /** Render a drag handle (for sortable lists). */
  showDragHandle?: boolean;
  className?: string;
}

export function AgentRoleCard({
  agentId,
  roleTitle,
  gap,
  accent,
  index,
  variant = "tile",
  onRemove,
  onEdit,
  peekNavIds,
  showDragHandle,
  className,
}: AgentRoleCardProps) {
  const agent = useAppSelector((s) => selectAgentById(s, agentId));
  const a = accentClasses(accent);
  const [expanded, setExpanded] = useState(false);

  const name = agent?.name ?? "Agent";
  const role = (roleTitle && roleTitle.trim()) || agent?.category || null;
  const summary =
    (gap && gap.trim()) ||
    agent?.description ||
    "Fills a role in this set — open to describe what it does.";
  const tags = (agent?.tags ?? []).slice(0, 3);
  const isNode = variant === "node";
  // Only offer expand when there's plausibly more than the clamp shows.
  const expandable = summary.length > (isNode ? 90 : 150);

  return (
    <div
      className={cn(
        "group/role relative flex flex-col rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all",
        "hover:border-border/80 hover:shadow-md",
        isNode ? "w-[264px]" : "w-full",
        className,
      )}
    >
      {/* accent rail — the card's color identity (replaces the old redundant glyph) */}
      <div className={cn("absolute inset-y-0 left-0 w-1 rounded-l-xl", a.dot)} />

      {/* floating hover actions over a backdrop, so they never eat name width */}
      <div className="absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded-md bg-card/85 opacity-0 backdrop-blur transition-opacity group-hover/role:opacity-100">
        <AgentPeekButton agentId={agentId} navigationIds={peekNavIds} />
        {onEdit && (
          <button
            type="button"
            aria-label="Edit role"
            onClick={onEdit}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            aria-label="Remove from set"
            onClick={onRemove}
            className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-3 pl-4">
        {/* row 1: order chip + name (full width) */}
        <div className="flex items-start gap-2 pr-2">
          {showDragHandle && (
            <button
              type="button"
              aria-label="Drag to reorder"
              className="mt-0.5 -ml-1 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          {typeof index === "number" && (
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                a.soft,
                a.text,
              )}
            >
              {index}
            </span>
          )}
          <h4 className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={name}>
            {name}
          </h4>
        </div>

        {role && <div className={cn("truncate text-[11px] font-medium", a.text)}>{role}</div>}

        {/* description — expandable in place */}
        <p
          className={cn(
            "text-xs leading-snug text-muted-foreground",
            !expanded && (isNode ? "line-clamp-2" : "line-clamp-3"),
          )}
        >
          {summary}
        </p>
        {expandable && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-0.5 self-start text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Show less" : "Show more"}
            <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          </button>
        )}

        {!isNode && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tags.map((t) => (
              <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
