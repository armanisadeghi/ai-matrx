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
  /** `compact` = the attach menu's quick row (four across in a 340px menu). */
  size?: "default" | "compact";
  /** A count chip on a tile's corner, keyed by tile id (run-control counts). */
  badges?: Partial<Record<string, number>>;
}

export function ResourcePickerTiles<T extends ResourcePickerTileItem>({
  items,
  selectedId,
  onSelect,
  className,
  size = "default",
  badges,
}: ResourcePickerTilesProps<T>) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        compact
          ? "grid grid-cols-4 gap-1.5"
          : "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const selected = selectedId === item.id;
        const badge = badges?.[item.id];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            aria-pressed={selected}
            data-tile-id={item.id}
            className={cn(
              "group relative flex w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 transition-all",
              compact ? "min-h-[4.25rem] py-2" : "min-h-16 py-2.5",
              selected
                ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
            )}
          >
            {badge !== undefined ? (
              <span className="absolute right-1 top-1 min-w-4 rounded-md bg-muted px-1 text-center text-[10px] leading-4 tabular-nums text-muted-foreground">
                {badge}
              </span>
            ) : null}
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg bg-muted transition-colors",
                selected && "bg-background ring-1 ring-primary/30",
              )}
            >
              <Icon className={cn(compact ? "h-[18px] w-[18px]" : "h-4 w-4", item.iconClassName)} />
            </span>
            <span
              className={cn(
                "max-w-full truncate whitespace-nowrap font-medium text-foreground",
                compact ? "text-xs" : "text-xs sm:text-sm",
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
