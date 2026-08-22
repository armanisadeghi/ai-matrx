"use client";

/**
 * The value-band decomposition scoreboard — the "site up 25% while Platinum
 * fell 3%" reality, on tiles that double as table filters (same interaction
 * as the classification workbench's ClassStatsBand, so the mental model
 * carries over). Unvalued is deliberately the loudest tile: it is the work
 * queue.
 */

import { ArrowDownRight, ArrowUpRight, Minus, Sparkle } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/features/marketing/search-console/types";
import type { ValueSummaryRow } from "../types";
import {
  aggregateSummary,
  computeDelta,
  formatPct,
  type BandMeta,
  type Delta,
} from "../lib";

function DeltaBadge({ delta, label }: { delta: Delta; label: string }) {
  if (delta.dir === "none") return null;
  const tone =
    delta.dir === "up"
      ? "text-success"
      : delta.dir === "down"
        ? "text-destructive"
        : delta.dir === "new"
          ? "text-info"
          : "text-muted-foreground";
  const Icon =
    delta.dir === "up"
      ? ArrowUpRight
      : delta.dir === "down"
        ? ArrowDownRight
        : delta.dir === "new"
          ? Sparkle
          : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums",
        tone,
      )}
      title={`${label} vs the previous 28 days`}
    >
      <Icon className="h-3 w-3" />
      {delta.dir === "new" ? "new" : delta.pct !== null ? formatPct(delta.pct) : ""}
    </span>
  );
}

export function BandScoreboard({
  metas,
  summary,
  isLoading,
  activeBand,
  onSelectBand,
}: {
  metas: BandMeta[];
  summary: ValueSummaryRow[] | undefined;
  isLoading: boolean;
  activeBand: string | null;
  onSelectBand: (band: string | null) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[72px] rounded-lg" />
        ))}
      </div>
    );
  }

  const byBand = aggregateSummary(summary ?? []);
  const totalClicks = [...byBand.values()].reduce((acc, b) => acc + b.clicks, 0);
  const totalCmpClicks = [...byBand.values()].reduce(
    (acc, b) => acc + b.cmpClicks,
    0,
  );
  const siteDelta = computeDelta(totalClicks, totalCmpClicks);

  // Headline: the site's move, plus the top valued band that moved against it
  // (or with it) — the sentence this whole system exists to print.
  const topBand = metas.find(
    (meta) => meta.reserved === null && (byBand.get(meta.value)?.queries ?? 0) > 0,
  );
  const topTotals = topBand ? byBand.get(topBand.value) : undefined;
  const topDelta = topTotals
    ? computeDelta(topTotals.clicks, topTotals.cmpClicks)
    : null;

  return (
    <div className="shrink-0 space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <p className="text-xs text-muted-foreground">
          {siteDelta.dir === "none" ? (
            "No clicks recorded in this window yet."
          ) : (
            <>
              Site clicks{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  siteDelta.dir === "up"
                    ? "text-success"
                    : siteDelta.dir === "down"
                      ? "text-destructive"
                      : "text-foreground",
                )}
              >
                {siteDelta.dir === "new"
                  ? "are new"
                  : siteDelta.dir === "flat" || siteDelta.pct === null
                    ? "held flat"
                    : formatPct(siteDelta.pct)}
              </span>{" "}
              vs the previous 28 days
              {topBand && topDelta && topDelta.dir !== "none" ? (
                <>
                  {" · "}
                  <span className={cn("font-medium", topBand.tone)}>
                    {topBand.label}
                  </span>{" "}
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      topDelta.dir === "up"
                        ? "text-success"
                        : topDelta.dir === "down"
                          ? "text-destructive"
                          : "text-foreground",
                    )}
                  >
                    {topDelta.dir === "new"
                      ? "is new"
                      : topDelta.dir === "flat" || topDelta.pct === null
                        ? "held flat"
                        : formatPct(topDelta.pct)}
                  </span>
                </>
              ) : null}
              . The tiles below say which value tiers actually moved.
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {metas
          .filter((meta) => meta.reserved !== "unvalued")
          .map((meta) => {
            const totals = byBand.get(meta.value);
            const clicks = totals?.clicks ?? 0;
            const impressions = totals?.impressions ?? 0;
            const queries = totals?.queries ?? 0;
            const clickDelta = computeDelta(clicks, totals?.cmpClicks ?? 0);
            const share = totalClicks > 0 ? (clicks / totalClicks) * 100 : 0;
            const active = activeBand === meta.value;
            return (
              <button
                key={meta.value}
                type="button"
                className={cn(
                  "rounded-lg border p-2 text-left transition-colors",
                  active
                    ? "border-primary bg-accent"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/50",
                )}
                title={`${meta.description ?? meta.label}\nClick to ${active ? "clear the" : "show only this"} tier in the table below.`}
                onClick={() => onSelectBand(active ? null : meta.value)}
              >
                <p className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "truncate text-[10px] font-medium uppercase tracking-wide",
                      meta.tone,
                    )}
                  >
                    {meta.label}
                  </span>
                  <DeltaBadge
                    delta={clickDelta}
                    label={`${meta.label} clicks`}
                  />
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums leading-tight">
                  {formatCount(queries)}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    keywords
                  </span>
                </p>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {formatCount(clicks)} clicks · {formatCount(impressions)}{" "}
                  impr.
                  {totalClicks > 0 ? ` · ${share.toFixed(0)}%` : ""}
                </p>
                {(totals?.overrideQueries ?? 0) > 0 ? (
                  <p className="text-[10px] text-primary">
                    {formatCount(totals?.overrideQueries)} ruled by you
                  </p>
                ) : null}
              </button>
            );
          })}
      </div>

      {/* The work queue — Unvalued is a first-class strip, never a ragged
          seventh tile. */}
      {(() => {
        const meta = metas.find((m) => m.reserved === "unvalued");
        if (!meta) return null;
        const totals = byBand.get(meta.value);
        const queries = totals?.queries ?? 0;
        const clicks = totals?.clicks ?? 0;
        const impressions = totals?.impressions ?? 0;
        const active = activeBand === meta.value;
        return (
          <button
            type="button"
            className={cn(
              "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-left transition-colors",
              active
                ? "border-primary bg-accent"
                : queries > 0
                  ? "border-warning/60 bg-warning/5 hover:border-warning hover:bg-warning/10"
                  : "border-border bg-card hover:border-primary/40 hover:bg-accent/50",
            )}
            title={`${meta.description ?? meta.label}\nClick to ${active ? "clear the" : "work"} this queue in the table below.`}
            onClick={() => onSelectBand(active ? null : meta.value)}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wide",
                  meta.tone,
                )}
              >
                {meta.label}
              </span>
              <span
                className={cn(
                  "text-lg font-semibold tabular-nums leading-tight",
                  queries > 0 && "text-warning",
                )}
              >
                {formatCount(queries)}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              {queries > 0 ? (
                <>
                  keywords carrying {formatCount(clicks)} clicks ·{" "}
                  {formatCount(impressions)} impr. have no meaning expressed
                  yet — this is the work queue.{" "}
                  <span className="font-medium text-foreground">
                    {active ? "Showing them below." : "Click to work it."}
                  </span>
                </>
              ) : (
                "Every active keyword carries a value — the work queue is empty."
              )}
            </span>
          </button>
        );
      })()}
    </div>
  );
}
