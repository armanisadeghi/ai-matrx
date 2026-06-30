// features/agents/agent-sets/components/AgentRoleCard.tsx
//
// The rich "what this agent does INSIDE the set" card. Built from the agent's
// own name/description/category/tags, overlaid with the user-authored role title
// + gap ("the gap it fills"). Reused as a React Flow node body, a grid tile, and
// a drag preview — driven by `variant`.

"use client";

import { Webhook, GripVertical, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { accentClasses } from "./accents";
import type { SetAccent } from "../constants";

export interface AgentRoleCardProps {
  agentId: string;
  /** Authored role title within the set (e.g. "Generator"). Falls back to category. */
  roleTitle?: string | null;
  /** Authored "gap this fills". Falls back to the agent's description. */
  gap?: string | null;
  accent?: SetAccent;
  /** 1-based ordinal shown as a "Step N" chip on the canvas. */
  index?: number;
  variant?: "node" | "tile";
  onRemove?: () => void;
  onEdit?: () => void;
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
  showDragHandle,
  className,
}: AgentRoleCardProps) {
  const agent = useAppSelector((s) => selectAgentById(s, agentId));
  const a = accentClasses(accent);

  const name = agent?.name ?? "Agent";
  const role = (roleTitle && roleTitle.trim()) || agent?.category || null;
  const summary =
    (gap && gap.trim()) ||
    agent?.description ||
    "Fills a role in this set — open to describe what it does.";
  const tags = (agent?.tags ?? []).slice(0, 3);
  const isNode = variant === "node";

  return (
    <div
      className={cn(
        "group/role relative flex flex-col rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all",
        "hover:shadow-md hover:border-border/80",
        isNode ? "w-[244px]" : "w-full",
        className,
      )}
    >
      {/* accent rail */}
      <div className={cn("absolute inset-y-0 left-0 w-1 rounded-l-xl", a.dot)} />

      <div className="flex items-start gap-2.5 p-3 pl-4">
        {showDragHandle && (
          <button
            type="button"
            aria-label="Drag to reorder"
            className="mt-0.5 -ml-1 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm",
            a.glyph,
          )}
        >
          <Webhook className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {typeof index === "number" && (
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  a.soft,
                  a.text,
                )}
              >
                {index}
              </span>
            )}
            <h4 className="truncate text-sm font-semibold text-foreground" title={name}>
              {name}
            </h4>
          </div>
          {role && (
            <div className={cn("mt-0.5 truncate text-[11px] font-medium", a.text)}>
              {role}
            </div>
          )}
        </div>

        {/* hover actions */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/role:opacity-100">
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
      </div>

      <p
        className={cn(
          "px-4 pb-3 text-xs leading-snug text-muted-foreground",
          isNode ? "line-clamp-2" : "line-clamp-3",
        )}
      >
        {summary}
      </p>

      {!isNode && tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
