"use client";

/**
 * The headline: what the site's search traffic is WORTH, band by band, with
 * compare deltas — "site up 25% while Platinum fell 3%" at a glance.
 * Tiles double as filters for the queue below; Unvalued is the work queue.
 */

import { ArrowDownRight, ArrowUpRight, ListTodo, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ValueSummaryRow } from "../../types";
import {
  RESERVED_UNVALUED,
  bandInfo,
  delta,
  fmtNum,
  type BandTone,
  type Delta,
} from "./lib";

interface BandAgg {
  band: string;
  label: string;
  tone: BandTone;
  sort: number;
  clicks: number;
  cmpClicks: number;
  queries: number;
  overrides: number;
}

export function aggregateBands(
  rows: ValueSummaryRow[],
  index: Map<string, { label: string; tone: BandTone; sort: number }>,
): { bands: BandAgg[]; totalClicks: number; totalCmpClicks: number; totalQueries: number } {
  const byBand = new Map<string, BandAgg>();
  let totalClicks = 0;
  let totalCmpClicks = 0;
  let totalQueries = 0;
  for (const row of rows) {
    const info = bandInfo(index, row.value_band);
    const agg = byBand.get(row.value_band) ?? {
      band: row.value_band,
      label: info.label,
      tone: info.tone,
      sort: info.sort,
      clicks: 0,
      cmpClicks: 0,
      queries: 0,
      overrides: 0,
    };
    agg.clicks += row.clicks;
    agg.cmpClicks += row.cmp_clicks;
    agg.queries += row.queries;
    if (row.value_source === "override") agg.overrides += row.queries;
    byBand.set(row.value_band, agg);
    totalClicks += row.clicks;
    totalCmpClicks += row.cmp_clicks;
    totalQueries += row.queries;
  }
  const bands = [...byBand.values()].sort((a, b) => a.sort - b.sort);
  return { bands, totalClicks, totalCmpClicks, totalQueries };
}

function DeltaBadge({ d, className }: { d: Delta; className?: string }) {
  const Icon =
    d.dir === "up" ? ArrowUpRight : d.dir === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        d.dir === "up" && "text-success",
        d.dir === "down" && "text-destructive",
        d.dir === "flat" && "text-muted-foreground",
        d.dir === "new" && "text-info",
        className,
      )}
    >
      {d.dir !== "new" && <Icon className="h-3 w-3" />}
      {d.text}
    </span>
  );
}

export function CompositionBand({
  rows,
  index,
  activeBand,
  onPickBand,
  onOpenQueue,
}: {
  rows: ValueSummaryRow[];
  index: Map<string, { label: string; tone: BandTone; sort: number }>;
  activeBand: string | null;
  onPickBand: (band: string | null) => void;
  onOpenQueue: () => void;
}) {
  const { bands, totalClicks, totalCmpClicks } = aggregateBands(rows, index);
  const siteDelta = delta(totalClicks, totalCmpClicks);
  const unvalued = bands.find((b) => b.band === RESERVED_UNVALUED);
  const valued = bands.filter((b) => b.band !== RESERVED_UNVALUED);

  return (
    <div className="space-y-3">
      {/* Site total + stacked composition bar */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2.5">
          <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {fmtNum(totalClicks)}
          </span>
          <span className="text-sm text-muted-foreground">clicks, whole site</span>
          <DeltaBadge d={siteDelta} className="text-sm" />
        </div>
        {unvalued && unvalued.queries > 0 && (
          <button
            type="button"
            onClick={onOpenQueue}
            className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-warning/20"
          >
            <ListTodo className="h-3.5 w-3.5 text-warning" />
            {fmtNum(unvalued.queries)} keywords still unvalued — review them
          </button>
        )}
      </div>

      {totalClicks > 0 && (
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {bands
            .filter((b) => b.clicks > 0)
            .map((b) => (
              <div
                key={b.band}
                className={cn("h-full transition-opacity", b.tone.bar,
                  activeBand && activeBand !== b.band && "opacity-30")}
                style={{ width: `${(b.clicks / totalClicks) * 100}%` }}
                title={`${b.label}: ${fmtNum(b.clicks)} clicks`}
              />
            ))}
        </div>
      )}

      {/* Band tiles — click to filter the queue */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[...valued, ...(unvalued ? [unvalued] : [])].map((b) => {
          const d = delta(b.clicks, b.cmpClicks);
          const active = activeBand === b.band;
          const share =
            totalClicks > 0 ? Math.round((b.clicks / totalClicks) * 100) : 0;
          return (
            <button
              key={b.band}
              type="button"
              onClick={() => onPickBand(active ? null : b.band)}
              className={cn(
                "group rounded-lg border bg-card px-3 py-2 text-left transition-colors",
                active
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-primary/40",
                b.band === RESERVED_UNVALUED && !active && "border-dashed",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", b.tone.dot)} />
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {b.label}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span className="text-base font-semibold tabular-nums text-foreground">
                  {fmtNum(b.clicks)}
                </span>
                <DeltaBadge d={d} />
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {share}% of clicks · {fmtNum(b.queries)} kw
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
