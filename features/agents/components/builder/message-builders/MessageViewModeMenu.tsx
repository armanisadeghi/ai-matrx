"use client";

/**
 * MessageViewModeMenu
 *
 * Single-icon dropdown that switches between Edit / Plain / Preview view modes
 * for any message in the agent builder (system, user, assistant). Sits beside
 * the role label rather than in the action-icon row, keeping the toolbar
 * uncluttered.
 *
 * Visual contract:
 *   - trigger: icon of the current mode + a small chevron-down, nothing else
 *   - menu: three items, each labeled and prefixed with its mode icon
 *   - same component everywhere so the surface looks identical across roles
 */

import { Edit2, Eye, SquarePilcrow, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type MessageViewMode = "edit" | "plain" | "preview";

const MODE_META: Record<
  MessageViewMode,
  {
    icon: typeof Edit2;
    label: string;
    description: string;
  }
> = {
  edit: {
    icon: Edit2,
    label: "Edit",
    description: "Write and modify the message.",
  },
  plain: {
    icon: Eye,
    label: "Plain View",
    description: "Read-only with variable highlighting.",
  },
  preview: {
    icon: SquarePilcrow,
    label: "Matrx Preview",
    description: "Render markdown the way the model will see it.",
  },
};

const MODE_ORDER: MessageViewMode[] = ["edit", "plain", "preview"];

export interface MessageViewModeMenuProps {
  viewMode: MessageViewMode;
  onChange: (mode: MessageViewMode) => void;
  className?: string;
}

export function MessageViewModeMenu({
  viewMode,
  onChange,
  className,
}: MessageViewModeMenuProps) {
  const ActiveIcon = MODE_META[viewMode].icon;
  const isPreview = viewMode === "preview";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`View mode: ${MODE_META[viewMode].label}`}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                "inline-flex items-center justify-center gap-2 h-5 px-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isPreview && "text-purple-500 hover:text-purple-400",
                className,
              )}
            >
              <ActiveIcon className="w-3.5 h-3.5" />
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[9999]">
          View mode — {MODE_META[viewMode].label}
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="start" sideOffset={4} className="w-52">
        {MODE_ORDER.map((mode) => {
          const meta = MODE_META[mode];
          const Icon = meta.icon;
          const active = mode === viewMode;
          return (
            <DropdownMenuItem
              key={mode}
              onSelect={() => onChange(mode)}
              className={cn(
                "gap-2 cursor-pointer",
                active && "bg-accent/60 text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "w-3.5 h-3.5 shrink-0",
                  mode === "preview" && active && "text-purple-500",
                )}
              />
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-xs font-medium truncate">
                  {meta.label}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {meta.description}
                </span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
