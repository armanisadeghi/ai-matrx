"use client";

/**
 * KindPanelGrid — content-aware responsive grid for side-by-side panels.
 *
 * Never more columns than the content can afford: every track is at least
 * `minColumnWidth` (default 280px) wide, the column count is whatever fits
 * (`auto-fit`), and every panel in a row stretches to the same height so the
 * panels' footers line up. Pair with `KindPanel` (its `footer` is pinned to
 * the bottom). Contract: `components/kind-kit/README.md`.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

const GAP_PX = { sm: 8, md: 12, lg: 16 } as const;
const GAP_CLASS = { sm: "gap-2", md: "gap-3", lg: "gap-4" } as const;

export interface KindPanelGridProps {
  children: React.ReactNode;
  /** Minimum width (px) of a column before the grid drops a column. Default 280. */
  minColumnWidth?: number;
  /** Hard ceiling on columns, however wide the container is. */
  maxColumns?: number;
  /** Space between panels. Default "md" (12px). */
  gap?: keyof typeof GAP_PX;
  /**
   * "auto-fit" (default): a short last row lets panels grow to fill the width.
   * "auto-fill": tracks stay the same width and the row is left short.
   */
  fill?: "auto-fit" | "auto-fill";
  className?: string;
}

export function KindPanelGrid({
  children,
  minColumnWidth = 280,
  maxColumns,
  gap = "md",
  fill = "auto-fit",
  className,
}: KindPanelGridProps) {
  const min = `min(100%, ${minColumnWidth}px)`;
  // With a column ceiling, each track must also be at least 1/n of the row —
  // which caps the count at n while still never going under minColumnWidth.
  const track =
    maxColumns && maxColumns > 0
      ? `max(${min}, calc((100% - ${GAP_PX[gap] * (maxColumns - 1)}px) / ${maxColumns}))`
      : min;
  return (
    <div
      className={cn("grid items-stretch", GAP_CLASS[gap], className)}
      style={{ gridTemplateColumns: `repeat(${fill}, minmax(${track}, 1fr))` }}
    >
      {children}
    </div>
  );
}
