"use client";

/**
 * The tile presentation of the canonical association doors: every option
 * visible at once as a big-icon grid (the Podcast Studio / Create deck shape).
 * Same item definitions, icons and per-kind tints as the attach menu rows —
 * pass items from `resource-picker-menu-items.tsx`
 * (`RESOURCE_PICKER_SOURCE_ITEMS`, `resourcePickerItemsAsTiles()`), never a
 * locally defined list.
 *
 * Copy law: a tile is a noun — no helper line, nothing that wraps.
 */

import { cn } from "@/utils/cn";
import type { ResourcePickerTileItem } from "./resource-picker-menu-items";

export interface ResourcePickerTilesProps<T extends ResourcePickerTileItem> {
  items: readonly T[];
  /** The open tile; it renders pressed. */
  selectedId?: string | null;
  onSelect: (item: T) => void;
  /** Grid classes — overrides the default auto-fill columns. */
  className?: string;
}

export function ResourcePickerTiles<T extends ResourcePickerTileItem>({
  items,
  selectedId,
  onSelect,
  className,
}: ResourcePickerTilesProps<T>) {
  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const selected = selectedId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            aria-pressed={selected}
            data-tile-id={item.id}
            className={cn(
              "group flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2.5 transition-all",
              selected
                ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg bg-muted transition-colors",
                selected && "bg-background ring-1 ring-primary/30",
              )}
            >
              <Icon className={cn("h-4 w-4", item.iconClassName)} />
            </span>
            <span className="max-w-full truncate whitespace-nowrap text-xs font-medium text-foreground sm:text-sm">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
