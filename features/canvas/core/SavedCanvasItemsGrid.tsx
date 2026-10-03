"use client";

/**
 * The Saved items grid, VIRTUALIZED: only the rows in (and just around) the
 * viewport are mounted.
 *
 * Why (2026-10-02, admin@admin.com on the clone, 741 items): the grid mounted
 * every card — 34,107 DOM nodes, a 640 ms long task to open the tab, ~110 ms
 * of re-render on every keystroke of a rename or search (each state change
 * re-rendered all 741 cards and their "…" menus), and since @ai-matrx/canvas
 * 0.5 keeps a shown tab mounted for the life of the page, the whole tree
 * stayed resident behind every other tab. Now the mounted card count is
 * bounded by the viewport (~a dozen), whatever the item count.
 *
 * Columns follow the PANE (the scroller's content width), never the viewport:
 * one column below 28rem, two below 54rem, three past that — the same
 * breakpoints the container-query grid used. They are computed in JS because a
 * virtualizer has to know how many cards share a row.
 */

import React, { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArchivedDisclosure } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import type { CanvasItemSummary } from "@/features/canvas/services/canvasItemsService";

const REM_PX = 16;
/** Estimated row height (card + row gap) before the row is measured. */
const ROW_ESTIMATE_PX = 172;
const OVERSCAN_ROWS = 3;

/** Columns for a grid whose content box is `widthPx` wide. */
export function savedGridColumns(widthPx: number): 1 | 2 | 3 {
  if (widthPx >= 54 * REM_PX) return 3;
  if (widthPx >= 28 * REM_PX) return 2;
  return 1;
}

type GridRow =
  | { type: "cards"; key: string; items: CanvasItemSummary[] }
  | { type: "archived-toggle"; key: string };

function chunkRows(items: CanvasItemSummary[], columns: number, prefix: string): GridRow[] {
  const rows: GridRow[] = [];
  for (let i = 0; i < items.length; i += columns) {
    const slice = items.slice(i, i + columns);
    rows.push({ type: "cards", key: `${prefix}:${slice[0].id}`, items: slice });
  }
  return rows;
}

export interface SavedCanvasItemsGridProps {
  activeItems: CanvasItemSummary[];
  archivedItems: CanvasItemSummary[];
  showArchived: boolean;
  onShowArchivedChange: (open: boolean) => void;
  renderItem: (item: CanvasItemSummary) => React.ReactNode;
  className?: string;
}

export function SavedCanvasItemsGrid({
  activeItems,
  archivedItems,
  showArchived,
  onShowArchivedChange,
  renderItem,
  className,
}: SavedCanvasItemsGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = (width: number) => {
      // A hidden canvas tab reports 0 — keep the last real column count.
      if (width > 0) setColumns(savedGridColumns(width));
    };
    const style = getComputedStyle(el);
    measure(el.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0"));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows: GridRow[] = chunkRows(activeItems, columns, "active");
  if (archivedItems.length > 0) {
    rows.push({ type: "archived-toggle", key: "archived-toggle" });
    if (showArchived) rows.push(...chunkRows(archivedItems, columns, "archived"));
  }

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: OVERSCAN_ROWS,
  });

  return (
    <div
      ref={scrollRef}
      data-saved-grid-scroll=""
      className={cn("min-h-0 overflow-y-auto scrollbar-thin p-4", className)}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-4"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.type === "cards" ? (
                <div
                  data-saved-grid-row=""
                  className="grid gap-4"
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                  {row.items.map(renderItem)}
                </div>
              ) : (
                <ArchivedDisclosure
                  count={archivedItems.length}
                  open={showArchived}
                  onOpenChange={onShowArchivedChange}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
