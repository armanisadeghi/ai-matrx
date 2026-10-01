"use client";

// app/(core)/podcast/studio/create-f/_components/OptionTile.tsx
//
// A single selectable tile used across the composer (source, format, hosts,
// length). One consistent shape so every choice in the studio reads the same:
// icon chip, label, optional helper, a clean selected state in the app's tokens.

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function OptionTile({
  icon: Icon,
  label,
  helper,
  selected,
  onClick,
  compact,
}: {
  icon?: LucideIcon;
  label: string;
  helper?: string;
  selected: boolean;
  onClick: () => void;
  /** Compact = no helper line, centered (used for hosts / length). */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group relative flex h-full w-full rounded-xl border p-3 text-left transition-all",
        compact ? "flex-col items-center gap-0.5 text-center" : "flex-col items-start gap-1.5",
        selected
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30 shadow-sm"
          : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground group-hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span
        className={cn(
          "font-medium leading-tight text-foreground",
          compact ? "text-sm" : "text-sm",
        )}
      >
        {label}
      </span>
      {helper && (
        <span className="text-[11px] leading-snug text-muted-foreground">{helper}</span>
      )}
    </button>
  );
}
