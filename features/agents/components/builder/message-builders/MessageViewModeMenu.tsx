"use client";

/**
 * MessageViewModeMenu
 *
 * Single-icon dropdown that switches between the SHARED editor modes (the same
 * names and icons as the content editor and Notes: Plain / Split / Read) for
 * any message in the agent builder (system, user, assistant). Sits beside the
 * role label rather than in the action-icon row, keeping the toolbar
 * uncluttered.
 *
 *   Plain — raw text; variables highlighted, click to type (was Edit + Plain View)
 *   Write — the rich editor over the same text; saves the exact bytes unless edited
 *   Split — raw text left, the formatted result live right
 *   Read  — the formatted text (was Matrx Preview)
 *
 * Visual contract:
 *   - trigger: icon of the current mode + a small chevron-down, nothing else
 *   - menu: four items, each labeled and prefixed with its mode icon
 *   - same component everywhere so the surface looks identical across roles
 */

import { Columns, Eye, FileText, ChevronDown, PenLine } from "lucide-react";
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

/**
 * "edit" is Plain while the text box has the caret (a click on the highlighted
 * text enters it; leaving returns to "plain") — one shared mode, two states.
 */
export type MessageViewMode = "edit" | "plain" | "write" | "split" | "preview";

type SharedMode = "plain" | "write" | "split" | "preview";

const MODE_META: Record<
  SharedMode,
  {
    icon: typeof FileText;
    label: string;
    description: string;
  }
> = {
  plain: {
    icon: FileText,
    label: "Plain",
    description: "Raw text with variables highlighted.",
  },
  write: {
    icon: PenLine,
    label: "Write",
    description: "Formatted editing; keeps the exact text.",
  },
  split: {
    icon: Columns,
    label: "Split",
    description: "Raw text left, the formatted result right.",
  },
  preview: {
    icon: Eye,
    label: "Read",
    description: "The formatted text, as the model reads it.",
  },
};

const MODE_ORDER: SharedMode[] = ["plain", "write", "split", "preview"];

/** The shared mode a view state belongs to. */
export function sharedModeOf(viewMode: MessageViewMode): SharedMode {
  return viewMode === "edit" ? "plain" : viewMode;
}

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
  const activeMode = sharedModeOf(viewMode);
  const ActiveIcon = MODE_META[activeMode].icon;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`View mode: ${MODE_META[activeMode].label}`}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                "inline-flex items-center justify-center gap-2 h-5 px-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                className,
              )}
            >
              <ActiveIcon className="w-3.5 h-3.5" />
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[9999]">
          View mode — {MODE_META[activeMode].label}
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="start" sideOffset={4} className="w-52">
        {MODE_ORDER.map((mode) => {
          const meta = MODE_META[mode];
          const Icon = meta.icon;
          const active = mode === activeMode;
          return (
            <DropdownMenuItem
              key={mode}
              // Choosing Plain puts the caret in the text (the old Edit).
              onSelect={() => onChange(mode === "plain" ? "edit" : mode)}
              className={cn(
                "gap-2 cursor-pointer",
                active && "bg-accent/60 text-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
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
