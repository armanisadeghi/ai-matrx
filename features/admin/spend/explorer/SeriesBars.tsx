// features/admin/spend/explorer/SeriesBars.tsx
//
// Change over time for the window: one stacked bar per hour (windows up to
// four days) or per day, manual on the bottom, automated on top. Deliberately
// not a chart library — it is two numbers per bucket. The peak bucket carries
// a direct label; every bar carries a hover title; the legend is always
// present because there are two series (dataviz rule: identity is never
// colour alone). Clicking a day bar drills into that day.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { usd } from "../format";
import type { SpendSeriesPoint } from "../types";
import { shortLocal } from "./labels";

export interface SeriesBarsProps {
  points: SpendSeriesPoint[];
  granularity: "hour" | "day";
  onPickDay?: (day: string) => void;
}

export function SeriesBars({ points, granularity, onPickDay }: SeriesBarsProps) {
  const peak = points.reduce((max, p) => Math.max(max, p.cost), 0);
  if (points.length === 0 || peak <= 0) {
    return (
      <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        Nothing was spent in this window.
      </p>
    );
  }
  const peakIndex = points.findIndex((p) => p.cost === peak);
  // Label every Nth tick so the axis stays legible at 48 or 720 buckets.
  const tickEvery = points.length <= 8 ? 1 : points.length <= 31 ? Math.ceil(points.length / 8) : 6;

  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="mb-1 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-2 rounded-sm bg-chart-2" /> Manual
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-2 rounded-sm bg-chart-1" /> Automated
        </span>
        <span className="ml-auto">
          per {granularity} · peak {usd(peak)} at {shortLocal(points[peakIndex]?.at ?? "")}
        </span>
      </div>
      <div className="flex h-28 items-end gap-[2px]">
        {points.map((p, i) => {
          const total = Math.max(0, p.cost);
          const heightPct = (total / peak) * 100;
          const manualPct = total > 0 ? (p.manual / total) * 100 : 0;
          const title = `${shortLocal(p.at)} — ${usd(p.cost)} (manual ${usd(p.manual)}, automated ${usd(p.automated)}, ${p.n} executions)`;
          const clickable = granularity === "day" && onPickDay !== undefined && total > 0;
          const bar = (
            <div
              className="flex w-full flex-col justify-end overflow-hidden rounded-t-[3px]"
              style={{ height: `${Math.max(total > 0 ? 2 : 0, heightPct)}%` }}
            >
              <div className="w-full bg-chart-1" style={{ height: `${100 - manualPct}%` }} />
              <div className="w-full bg-chart-2" style={{ height: `${manualPct}%` }} />
            </div>
          );
          return (
            <div
              key={p.at}
              className="relative flex h-full min-w-[3px] flex-1 flex-col justify-end"
              title={title}
            >
              {i === peakIndex ? (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-foreground">
                  {usd(peak)}
                </span>
              ) : null}
              {clickable ? (
                <button
                  type="button"
                  className="flex h-full w-full flex-col justify-end hover:opacity-80"
                  onClick={() => onPickDay?.(p.at)}
                  aria-label={`Look only at ${shortLocal(p.at)}`}
                >
                  {bar}
                </button>
              ) : (
                bar
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
        {points.map((p, i) => (
          <div key={p.at} className="min-w-[3px] flex-1 truncate">
            {i % tickEvery === 0 ? shortLocal(p.at) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
