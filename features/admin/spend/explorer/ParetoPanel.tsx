// features/admin/spend/explorer/ParetoPanel.tsx
//
// THE 80/20 VIEW (Arman, 2026-09-12: "pages where they show you the eighty
// twenty rule that tells you where's eighty percent of your spending going …
// if you show everything that adds up to eighty percent in total, it would be
// a few entries, and then everything else could be summed up as other").
//
// For each dimension: the fewest rows that together reach 80% of the window,
// then ONE "everything else" row. A dimension where one row alone is 80% shows
// one row. Every row drills; every identity opens.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { usd } from "../format";
import type { SpendBreakdown, SpendDimension, SpendDimensionRow } from "../types";
import { DIMENSION_LABEL, identityHref, percent, rowLabel } from "./labels";

const PARETO_DIMENSIONS: readonly SpendDimension[] = [
  "user",
  "agent",
  "feature",
  "conversation",
  "model",
  "organization",
];

export interface ParetoCut {
  head: SpendDimensionRow[];
  headCost: number;
  restCost: number;
  restCount: number;
  distinct: number;
}

/** The fewest top rows whose cumulative share reaches `target`. */
export function paretoCut(
  rows: SpendDimensionRow[],
  distinct: number,
  total: number,
  target = 0.8,
): ParetoCut {
  const sorted = [...rows].sort((a, b) => b.cost - a.cost);
  const head: SpendDimensionRow[] = [];
  let headCost = 0;
  for (const row of sorted) {
    if (total > 0 && headCost / total >= target) break;
    head.push(row);
    headCost += row.cost;
  }
  // "Everything else" is the total minus the head — it includes the rows the
  // RPC capped away, so the shares always add up to the window.
  const restCost = Math.max(0, total - headCost);
  const restCount = Math.max(0, distinct - head.length);
  return { head, headCost, restCost, restCount, distinct };
}

function ParetoCard({
  dim,
  cut,
  total,
  onDrill,
}: {
  dim: SpendDimension;
  cut: ParetoCut;
  total: number;
  onDrill: (dim: SpendDimension, key: string) => void;
}) {
  const headShare = total > 0 ? cut.headCost / total : 0;
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-border bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-sm font-semibold text-foreground">{DIMENSION_LABEL[dim]}</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {cut.head.length} of {cut.distinct} = {percent(headShare)}
        </span>
      </div>
      <ul className="flex flex-col">
        {cut.head.map((row) => {
          const href = identityHref(dim, row.key);
          const label = rowLabel(dim, row);
          return (
            <li key={row.key} className="group relative flex items-center gap-2 px-3 py-1">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0.5 left-0 rounded-r-sm bg-primary/10"
                style={{ width: `${Math.max(0.5, row.share * 100)}%` }}
              />
              <button
                type="button"
                onClick={() => onDrill(dim, row.key)}
                className="relative min-w-0 flex-1 truncate text-left text-xs text-foreground hover:underline"
                title={`Look only at ${label}`}
              >
                {label}
              </button>
              <span className="relative w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {percent(row.share)}
              </span>
              <span className="relative w-16 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
                {usd(row.cost)}
              </span>
              {href ? (
                <Link
                  href={href}
                  className="relative shrink-0 text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100"
                  title="Open"
                  aria-label={`Open ${label}`}
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                <span className="relative h-3 w-3 shrink-0" aria-hidden />
              )}
            </li>
          );
        })}
        {cut.restCount > 0 || cut.restCost > 0.005 ? (
          <li className="flex items-center gap-2 border-t border-dashed border-border px-3 py-1 text-[11px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              Everything else ({cut.restCount} more)
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums">
              {percent(total > 0 ? cut.restCost / total : 0)}
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums">{usd(cut.restCost)}</span>
            <span className="h-3 w-3 shrink-0" aria-hidden />
          </li>
        ) : null}
        {cut.head.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">Nothing in this window.</li>
        ) : null}
      </ul>
    </div>
  );
}

export function ParetoPanel({
  data,
  onDrill,
}: {
  data: SpendBreakdown;
  onDrill: (dim: SpendDimension, key: string) => void;
}) {
  const total = data.totals.cost;
  // A dimension already filtered to one value has nothing to say here.
  const dims = PARETO_DIMENSIONS.filter((dim) => !data.filters[dim]);
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {dims.map((dim) => {
        const d = data.dimensions[dim];
        const cut = paretoCut(d.rows, d.distinct, total);
        return <ParetoCard key={dim} dim={dim} cut={cut} total={total} onDrill={onDrill} />;
      })}
    </div>
  );
}
