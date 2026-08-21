"use client";

/**
 * The decomposition strip — one cell per value band plus the site total,
 * every number carrying its compare delta. This is the "site up 25% while
 * Platinum fell 3%" reality at the top of the screen; each cell is also the
 * band filter for the table below.
 */

import { ArrowDownRight, ArrowUpRight, Inbox, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ValueSummaryRow } from "../../types";
import {
  bandMeta,
  computeDelta,
  fmtCount,
  fmtDeltaPct,
  type BandMeta,
  type Delta,
} from "./lib";

function DeltaTag({ delta, invert = false }: { delta: Delta; invert?: boolean }) {
  if (delta.direction === "none") {
    return <span className="text-[11px] tabular-nums text-muted-foreground/60">–</span>;
  }
  // For the negative band more traffic is bad news — invert the coloring so
  // the color always means "good/bad for the business", never just "up/down".
  const good = delta.direction === "up" || delta.direction === "new";
  const isGood = invert ? !good : good;
  const Icon =
    delta.direction === "up" || delta.direction === "new"
      ? ArrowUpRight
      : delta.direction === "down"
        ? ArrowDownRight
        : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
        delta.direction === "flat"
          ? "text-muted-foreground"
          : isGood
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-destructive",
      )}
    >
      <Icon className="h-3 w-3" />
      {fmtDeltaPct(delta)}
    </span>
  );
}

interface LedgerCell {
  meta: BandMeta;
  clicks: number;
  impressions: number;
  queries: number;
  clicksDelta: Delta;
  queriesDelta: Delta;
  share: number;
}

export function BandLedger({
  summary,
  bandIndex,
  activeBand,
  onBandClick,
}: {
  summary: ValueSummaryRow[];
  bandIndex: Map<string, BandMeta>;
  activeBand: string | null;
  onBandClick: (band: string | null) => void;
}) {
  // The RPC may split a band across sources (override vs computed) — the
  // ledger presents per-band totals; source split lives in the table filter.
  const byBand = new Map<string, ValueSummaryRow>();
  for (const row of summary) {
    const existing = byBand.get(row.value_band);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.queries += row.queries;
      existing.cmp_clicks += row.cmp_clicks;
      existing.cmp_impressions += row.cmp_impressions;
      existing.cmp_queries += row.cmp_queries;
    } else {
      byBand.set(row.value_band, { ...row });
    }
  }

  const totals = [...byBand.values()].reduce(
    (acc, r) => ({
      clicks: acc.clicks + r.clicks,
      impressions: acc.impressions + r.impressions,
      queries: acc.queries + r.queries,
      cmpClicks: acc.cmpClicks + r.cmp_clicks,
      cmpQueries: acc.cmpQueries + r.cmp_queries,
    }),
    { clicks: 0, impressions: 0, queries: 0, cmpClicks: 0, cmpQueries: 0 },
  );

  const cells: LedgerCell[] = [...byBand.values()]
    .map((r) => ({
      meta: bandMeta(bandIndex, r.value_band),
      clicks: r.clicks,
      impressions: r.impressions,
      queries: r.queries,
      clicksDelta: computeDelta(r.clicks, r.cmp_clicks),
      queriesDelta: computeDelta(r.queries, r.cmp_queries),
      share: totals.clicks > 0 ? (r.clicks / totals.clicks) * 100 : 0,
    }))
    .sort((a, b) => a.meta.sort - b.meta.sort);

  const siteDelta = computeDelta(totals.clicks, totals.cmpClicks);

  return (
    <div className="flex items-stretch gap-px overflow-x-auto border-b border-border bg-border/40 scrollbar-thin">
      {/* Site total — the anchor every band is judged against */}
      <div className="flex min-w-[132px] shrink-0 flex-col justify-between bg-card px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Site
          </span>
          <DeltaTag delta={siteDelta} />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {fmtCount(totals.clicks)}
          </span>
          <span className="text-[11px] text-muted-foreground">clicks</span>
        </div>
        <div className="text-[11px] tabular-nums text-muted-foreground">
          {fmtCount(totals.queries)} queries · {fmtCount(totals.impressions)} impr
        </div>
      </div>

      {cells.map((cell) => {
        const active = activeBand === cell.meta.slug;
        const isUnvalued = cell.meta.slug === "unvalued";
        return (
          <button
            key={cell.meta.slug}
            type="button"
            onClick={() => onBandClick(active ? null : cell.meta.slug)}
            title={
              cell.meta.description ??
              `${cell.meta.label}: filter the table to this band`
            }
            className={cn(
              "group relative flex min-w-[124px] flex-1 shrink-0 flex-col justify-between px-3 py-1.5 text-left transition-colors",
              active
                ? "bg-accent ring-1 ring-inset ring-primary/40"
                : "bg-card hover:bg-accent/50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", cell.meta.tone.dot)} />
                <span className="truncate text-[11px] font-semibold text-foreground">
                  {cell.meta.label}
                </span>
                {isUnvalued ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium leading-none text-amber-700 dark:text-amber-400">
                    <Inbox className="h-2.5 w-2.5" />
                    work queue
                  </span>
                ) : null}
              </span>
              <DeltaTag delta={cell.clicksDelta} invert={cell.meta.negative} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {fmtCount(cell.clicks)}
              </span>
              <span className="text-[11px] text-muted-foreground">clicks</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {Math.round(cell.share)}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {fmtCount(cell.queries)} queries
              </span>
              <DeltaTag delta={cell.queriesDelta} invert={cell.meta.negative} />
            </div>
            {/* Share bar — the composition read at a glance */}
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent">
              <div
                className={cn("h-full", cell.meta.tone.dot)}
                style={{ width: `${Math.max(cell.share, cell.clicks > 0 ? 2 : 0)}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
