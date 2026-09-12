// features/admin/spend/SpendHeadline.tsx
//
// THE canonical spend headline. The dashboard renders it and the daily popover
// window wraps this same component — a window panel wraps the canonical
// component, never a hand-rolled copy (features/window-panels/FEATURE.md).
//
// "Spent so far today" is deliberately the largest thing on any surface that
// shows it (Arman, 2026-09-11: "The key is to scare me by showing me how much
// money we spent so far today"). Above the `scare_threshold_usd` knob it turns
// destructive-toned — colour and wording only. Nothing is ever blocked.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { deltaPercent, formatDelta, usd, count, zoneLabel } from "./format";

export interface SpendHeadlineProps {
  today: number;
  todayRuns?: number;
  yesterday: number;
  last7d: number;
  /** Omitted by the popover, which only carries the short windows. */
  last30d?: number;
  monthToDate: number;
  monthProjection?: number | null;
  /** From `platform.spend_popover.scare_threshold_usd`. */
  scareThresholdUsd: number;
  timezone: string;
  /** `compact` is the popover's density; `full` is the dashboard's. */
  density?: "compact" | "full";
}

interface TileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "alarm";
  size?: "hero" | "normal";
}

function Tile({ label, value, hint, tone = "normal", size = "normal" }: TileProps) {
  const alarm = tone === "alarm";
  return (
    <div
      className={[
        "flex min-w-0 flex-col justify-between rounded-md border px-3 py-2",
        alarm
          ? "border-destructive/50 bg-destructive/10"
          : "border-border bg-card",
      ].join(" ")}
    >
      <div
        className={[
          "truncate text-[11px] font-medium uppercase tracking-wide",
          alarm ? "text-destructive" : "text-muted-foreground",
        ].join(" ")}
      >
        {label}
      </div>
      <div
        className={[
          "truncate font-semibold tabular-nums",
          size === "hero" ? "text-3xl leading-tight" : "text-lg leading-tight",
          alarm ? "text-destructive" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </div>
      {hint ? (
        <div
          className={[
            "truncate text-[11px]",
            alarm ? "text-destructive/80" : "text-muted-foreground",
          ].join(" ")}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function SpendHeadline({
  today,
  todayRuns,
  yesterday,
  last7d,
  last30d,
  monthToDate,
  monthProjection,
  scareThresholdUsd,
  timezone,
  density = "full",
}: SpendHeadlineProps) {
  const alarm = today > scareThresholdUsd;
  const delta = deltaPercent(today, yesterday);
  const rising = delta !== null && delta > 0;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={[
          "grid gap-2",
          density === "compact"
            ? "grid-cols-2 sm:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
        ].join(" ")}
      >
        <div
          className={
            density === "compact"
              ? "col-span-2 sm:col-span-3"
              : "col-span-2 sm:col-span-3 lg:col-span-2"
          }
        >
          <Tile
            label="Spent so far today"
            value={usd(today)}
            size="hero"
            tone={alarm ? "alarm" : "normal"}
            hint={
              alarm
                ? `Past the ${usd(scareThresholdUsd)} alarm line${
                    todayRuns === undefined ? "" : ` · ${count(todayRuns)} runs`
                  }`
                : todayRuns === undefined
                  ? undefined
                  : `${count(todayRuns)} runs`
            }
          />
        </div>
        <Tile label="Yesterday" value={usd(yesterday)} hint={formatDelta(delta)} />
        <Tile label="Last 7 days" value={usd(last7d)} />
        {density === "full" && last30d !== undefined ? (
          <Tile label="Last 30 days" value={usd(last30d)} />
        ) : null}
        <Tile
          label="This month"
          value={usd(monthToDate)}
          hint={
            monthProjection === null || monthProjection === undefined
              ? "too early to project"
              : `on pace for ${usd(monthProjection)}`
          }
        />
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {delta !== null ? (
          rising ? (
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )
        ) : null}
        <span className="min-w-0">
          AI and provider executions only. Days are cut at local midnight in{" "}
          {zoneLabel(timezone)}. This is a lower bound — several cost sources
          record nothing.
        </span>
      </p>
    </div>
  );
}
