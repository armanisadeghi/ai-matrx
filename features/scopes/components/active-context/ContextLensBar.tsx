"use client";

// features/scopes/components/active-context/ContextLensBar.tsx
//
// THE composer context control — one condensed pill with two segments:
//
//   [ 👁 Context │ ●● 1 org · 1 scope ⌄ ]
//
// Left segment  — "Context" doubles as the label for the whole control AND the
//                 entry point to the context preview panel: exactly what the
//                 agent will receive under the current settings (server truth).
// Right segment — the Lens Chip picker (ActiveContextLensChip): edit the
//                 active org / scopes / project / task.
//
// Pure composition: it does not fork LensChip or the picker — it wraps the
// existing ActiveContextLensChip and restyles it borderless inside the shared
// pill. Hosts supply `onOpenPreview` (typically the contextPreviewPanel
// overlay opener); without it the left segment renders as a plain label.

import React from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActiveContextLensChip } from "./ActiveContextLensChip";

export interface ContextLensBarProps {
  /** Opens the "what the agent receives" preview panel. */
  onOpenPreview?: () => void;
  /** True while the preview panel is open — highlights the left segment. */
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
        "inline-flex h-6 shrink-0 items-center overflow-hidden rounded-full border border-border bg-card",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenPreview}
        disabled={!onOpenPreview}
        title="See exactly what the agent receives with your current context"
        className={cn(
          "group/ctx inline-flex h-full items-center gap-1 pl-2 pr-1.5",
          "text-[10px] font-medium uppercase tracking-wider",
          previewOpen
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground/80",
          onOpenPreview &&
            !previewOpen &&
            "transition-colors hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <Eye
          className={cn(
            "h-3 w-3",
            previewOpen
              ? "opacity-100"
              : "opacity-70 transition-opacity group-hover/ctx:opacity-100",
          )}
        />
        Context
      </button>
      <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" />
      <ActiveContextLensChip
        align={align}
        className="h-full rounded-none border-0 bg-transparent px-2 text-[11px] hover:bg-muted/60"
      />
    </div>
  );
}
