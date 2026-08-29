/**
 * features/files/components/core/FilePreview/PreviewerActionBar/PreviewerActionBar.tsx
 *
 * Reusable toolbar shown above any file preview. Each previewer used to
 * reinvent its own header/footer for download / copy / etc. — this is the
 * single primitive that hosts the per-type action descriptors emitted by
 * `preview-actions.ts`.
 *
 * Compact mode collapses non-primary actions into a "…" overflow menu so
 * tile-sized previews don't drown in chrome.
 */

"use client";

import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";

export interface PreviewerAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void | Promise<void>;
  /** Promote into the visible row; non-primary actions land in overflow. */
  primary?: boolean;
  disabled?: boolean;
  /** Tooltip note shown when disabled. */
  disabledHint?: string;
}

export interface PreviewerActionBarProps {
  actions: PreviewerAction[];
  compact?: boolean;
  className?: string;
}

export function PreviewerActionBar({
  actions,
  compact = false,
  className,
}: PreviewerActionBarProps) {
  if (actions.length === 0) return null;

  const primary = actions.filter((a) => a.primary !== false);
  const overflow = actions.filter((a) => a.primary === false);

  // Compact: only show explicitly-primary actions inline; everything else
  // goes into the overflow dropdown so we don't blow up small tiles.
  const inline = compact ? actions.filter((a) => a.primary === true) : primary;
  const dropdown = compact
    ? actions.filter((a) => a.primary !== true)
    : overflow;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/60 bg-background/80 px-2 py-1",
        className,
      )}
    >
      {inline.map((action) => {
        const Icon = action.icon;
        const tip =
          action.disabled && action.disabledHint
            ? action.disabledHint
            : action.label;
        return (
          <TooltipIcon key={action.id} label={tip}>
            <button
              type="button"
              onClick={() => void action.onClick()}
              disabled={action.disabled}
              aria-label={action.label}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium max-lg:min-h-11 max-lg:min-w-11",
                "text-foreground/80 hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                action.disabled && "opacity-40 pointer-events-none",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {!compact ? <span>{action.label}</span> : null}
            </button>
          </TooltipIcon>
        );
      })}

      {dropdown.length > 0 ? (
        <DropdownMenu>
          <TooltipIcon label="More actions">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More preview actions"
                className="ml-auto flex h-7 w-7 max-lg:h-11 max-lg:w-11 max-lg:min-w-11 max-lg:shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </TooltipIcon>
          <DropdownMenuContent align="end" className="w-52">
            {dropdown.map((action) => {
              const Icon = action.icon;
              return (
                <DropdownMenuItem
                  key={action.id}
                  onClick={() => void action.onClick()}
                  disabled={action.disabled}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {action.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
