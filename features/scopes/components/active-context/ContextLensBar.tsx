"use client";

// features/scopes/components/active-context/ContextLensBar.tsx
//
// THE composer context control — the Lens Chip (reimagine T2 face) grown into
// ONE seamless pill with two zones and NO internal border:
//
//   [ 👁  ●● 1 org · 1 scope ⌄ ]
//
// Eye zone   — opens the context preview panel: exactly what the agent will
//              receive under the current settings (server truth). Primary
//              tint on hover/open.
// Chip zone  — the canonical LensChip content (colored dots + count summary +
//              chevron) opening the ActiveContextTree picker.
//
// Pure composition: the picker wiring stays in ActiveContextLensChip; this
// only supplies the shared pill chrome. Hosts pass `onOpenPreview`.

import React from "react";
import { Eye } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ActiveContextLensChip } from "./ActiveContextLensChip";

export interface ContextLensBarProps {
  /** Opens the "what the agent receives" preview panel. */
  onOpenPreview?: () => void;
  /** True while the preview panel is open — keeps the eye zone lit. */
  previewOpen?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
}

export function ContextLensBar({
  onOpenPreview,
  previewOpen = false,
  align = "start",
  className,
}: ContextLensBarProps) {
  return (
    <div
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full border border-border bg-card pl-1 pr-0.5 text-xs",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenPreview}
            disabled={!onOpenPreview}
            aria-label="See exactly what the agent receives with your current context"
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded-full px-1.5 transition-colors",
              previewOpen
                ? "bg-primary/15 text-primary"
                : "text-primary/80 hover:bg-primary/10 hover:text-primary",
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="font-medium">Context</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          See exactly what the agent receives
        </TooltipContent>
      </Tooltip>
      <ActiveContextLensChip
        align={align}
        className="h-5 rounded-full border-0 bg-transparent px-1.5 text-xs hover:bg-muted"
      />
    </div>
  );
}
