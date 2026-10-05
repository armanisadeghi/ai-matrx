"use client";

/**
 * KpiRow — the page-top variant that leads with the page's own numbers
 * (owner, 2026-10-03, feedback item 3: "a KPI row").
 *
 * It is a LAYOUT over the official tile, never a second tile: every number is
 * `components/official/kpi/KpiTile` (label, value, one-line hint, a drill-in
 * `href`, and the read state — a failed read shows "—", never 0). This file
 * only decides how a row of them sits on a page:
 *
 * - Desktop: one even row, as many columns as tiles (up to 6), 8px apart.
 * - Phone: a sideways strip inside the 12px gutter, so the KPIs stay ONE row
 *   and the page's real content starts high instead of under a 3×2 wall.
 * - Every number that names a set of records is a door (`href`).
 */

import { KpiTile, type KpiTileProps } from "@/components/official/kpi/KpiTile";
import { cn } from "@/lib/utils";

export type KpiRowItem = KpiTileProps & { id: string };

const COLS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
  6: "sm:grid-cols-3 lg:grid-cols-6",
};

export function KpiRow({ items, ariaLabel = "Key numbers", className }: { items: KpiRowItem[]; ariaLabel?: string; className?: string }) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "-mx-[var(--matrx-page-gutter)] flex snap-x scroll-px-[var(--matrx-page-gutter)] gap-2 overflow-x-auto px-[var(--matrx-page-gutter)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:mx-0 sm:grid sm:overflow-visible sm:px-0",
        COLS[Math.min(6, Math.max(1, items.length))],
        className,
      )}
    >
      {items.map(({ id, className: tileClass, ...tile }) => (
        <KpiTile key={id} {...tile} className={cn("w-32 shrink-0 snap-start rounded-lg sm:w-auto", tileClass)} />
      ))}
    </section>
  );
}
