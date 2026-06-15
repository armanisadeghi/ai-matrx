"use client";

// features/war-room/components/tile/TileTabBar.tsx
//
// Compact, icon-only tab switcher. Lives inline in the tile header (no separate
// row, no labels) — the icons are self-explanatory and reclaim vertical space.

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
}: {
  active: TileTab;
  onChange: (tab: TileTab) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
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
            aria-pressed={isActive}
            title={label}
            className={cn(
              "grid place-items-center size-6 rounded-md transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
