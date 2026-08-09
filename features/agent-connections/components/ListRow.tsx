"use client";

/**
 * ListRow — one item row inside an Agent Connections section.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): the row's click means
 * "show this item in the section's detail pane", NOT "open the record", so the
 * name cannot be an anchor here — an `<a>` (or a peek button) inside a
 * `<button>` is invalid DOM, and a stray click that navigated away would cost
 * the user the panel they are standing in. The row therefore splits: a button
 * that fills the row, and a `door` slot rendered as its SIBLING, which callers
 * fill with `<EntityDoorControls>` for records that have an identity.
 *
 * The wrapper carries `group/entity-ref` so those controls fade in on row
 * hover, exactly like every other surface in the campaign.
 */

import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListRowProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  status?: {
    label: string;
    tone?: "default" | "stopped" | "running" | "error";
  };
  onClick?: () => void;
  /**
   * Doors for the record this row names — pass `<EntityDoorControls …/>`.
   * Rendered beside the button, never inside it.
   */
  door?: React.ReactNode;
}

export function ListRow({
  icon: Icon,
  title,
  subtitle,
  status,
  onClick,
  door,
}: ListRowProps) {
  const statusClasses =
    status?.tone === "running"
      ? "bg-emerald-500/15 text-emerald-500"
      : status?.tone === "error"
        ? "bg-red-500/15 text-red-500"
        : "bg-sky-500/20 text-sky-400";

  return (
    <div
      className={cn(
        "group/entity-ref group flex items-start gap-2 pr-4",
        "hover:bg-muted/40 transition-colors",
        "border-b border-border/40 last:border-b-0",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 min-w-0 items-start gap-3 px-4 py-2.5 text-left"
      >
        <Icon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {title}
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </button>
      {status && (
        <span
          className={cn(
            "shrink-0 inline-flex items-center h-5 mt-2.5 px-2 rounded-full text-xs font-medium",
            statusClasses,
          )}
        >
          {status.label}
        </span>
      )}
      {door && <span className="shrink-0 mt-3">{door}</span>}
    </div>
  );
}

export default ListRow;
