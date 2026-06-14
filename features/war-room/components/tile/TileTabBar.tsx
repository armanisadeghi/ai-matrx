"use client";

// features/war-room/components/tile/TileTabBar.tsx

import { ListChecks, NotebookPen, Mic, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TileTab } from "@/features/war-room/types";

const TABS: { id: TileTab; label: string; Icon: typeof ListChecks }[] = [
  { id: "task", label: "Task", Icon: ListChecks },
  { id: "notes", label: "Notes", Icon: NotebookPen },
  { id: "audio", label: "Audio", Icon: Mic },
  { id: "combined", label: "All", Icon: LayoutGrid },
];

export function TileTabBar({
  active,
  onChange,
  compact,
}: {
  active: TileTab;
  onChange: (tab: TileTab) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border/70 bg-muted/30 overflow-hidden">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(id);
            }}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-md px-2 h-6 text-[11px] font-medium whitespace-nowrap transition-colors",
              isActive
                ? "bg-card text-foreground shadow-[var(--elevation-1)]"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
            )}
            aria-pressed={isActive}
            title={label}
          >
            <Icon className="size-3.5 shrink-0" />
            {/* Label hides on narrow tiles (container query) → icon-only. */}
            {!compact && <span className="@max-[18rem]:hidden">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
