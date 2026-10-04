"use client";

/**
 * ParkedShelf — where a tile thrown to the right waits. Screen-space chrome
 * on the right edge; each chip keeps the tile's live status, and one click
 * puts it back exactly where it was and flies there.
 */

import type { LucideIcon } from "lucide-react";
import { PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ParkedChip {
  id: string;
  title: string;
  icon?: LucideIcon;
}

export function ParkedShelf({
  parked,
  onRestore,
  className,
}: {
  parked: ParkedChip[];
  onRestore: (id: string) => void;
  className?: string;
}) {
  if (parked.length === 0) return null;
  return (
    <div
      data-spatial-chrome
      className={cn(
        "absolute right-4 top-4 flex max-h-[calc(100%-12rem)] w-56 flex-col overflow-hidden rounded-lg border border-border bg-card/95 shadow-md backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        <PanelRightOpen className="h-3.5 w-3.5" />
        {`Parked · ${parked.length}`}
      </div>
      <ul className="min-h-0 overflow-y-auto p-1">
        {parked.map(({ id, title, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onRestore(id)}
              title="Put back on the board"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className="truncate">{title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
