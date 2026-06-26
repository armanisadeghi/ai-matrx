"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type DrillSegment = {
  label: string;
  onClick?: () => void;
};

/** Compact breadcrumb + back for in-tile project → task → subtask navigation. */
export function TileDrillHeader({
  segments,
  onBack,
  compact,
}: {
  segments: DrillSegment[];
  onBack: () => void;
  compact?: boolean;
}) {
  if (segments.length === 0) return null;

  return (
    <div
      className={cn(
        "flex h-7 shrink-0 items-center gap-1 border-b border-border/60 bg-card/50",
        compact ? "px-0" : "px-2",
      )}
    >
      <button
        type="button"
        onClick={onBack}
        title="Back"
        aria-label="Back"
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" />
      </button>

      <nav
        aria-label="Task drill path"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-[11px]"
      >
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          return (
            <span
              key={`${seg.label}-${i}`}
              className="flex min-w-0 items-center gap-0.5"
            >
              {i > 0 ? (
                <ChevronRight
                  className="size-3 shrink-0 text-muted-foreground/50"
                  aria-hidden
                />
              ) : null}
              {seg.onClick && !isLast ? (
                <button
                  type="button"
                  onClick={seg.onClick}
                  className="max-w-[8rem] truncate font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {seg.label}
                </button>
              ) : (
                <span
                  className={cn(
                    "max-w-[10rem] truncate",
                    isLast
                      ? "font-semibold text-foreground"
                      : "font-medium text-muted-foreground",
                  )}
                >
                  {seg.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
