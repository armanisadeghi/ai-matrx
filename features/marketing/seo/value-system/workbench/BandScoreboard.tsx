"use client";

/**
 * THE LEVEL BREAKDOWN — how this window's traffic splits across the site's own
 * value levels, on tiles that double as table filters (same interaction as the
 * classification workbench's ClassStatsBand, so the mental model carries over).
 *
 * 🚨 2026-08-23 — THIS IS NOW SUBORDINATE, AND THAT IS DELIBERATE. It used to
 * be the top of the page and carried three things that are now said better and
 * higher up by `./ValueKpiBand`:
 *
 *  1. Its "Site clicks held flat vs the previous 28 days…" headline restated
 *     the verdict sentence directly above it, in different words. One truth
 *     per page: the verdict keeps the sentence, this keeps the decomposition.
 *  2. Its full-width UNVALUED strip was the THIRD place on one screen showing
 *     the same 4,385. Unvalued is now a KPI tile with the session button on
 *     it, and it stays here only as an ordinary tile — because a person
 *     filtering by level still needs to be able to pick it.
 *  3. Its tiles were the biggest numbers on the page. Arman kept them
 *     ("don't get rid of them yet") but was explicit that he is not sure they
 *     are meaningful, so they render marked PROVISIONAL, under the KPIs,
 *     not over them.
 *
 * Every tile is still a live filter into the table — nothing was made
 * decorative, only smaller.
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
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] font-medium tabular-nums",
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
      <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-14 rounded-md" />
        ))}
      </div>
    );
  }

  const byBand = aggregateSummary(summary ?? []);
  const totalClicks = [...byBand.values()].reduce((acc, b) => acc + b.clicks, 0);

  return (
    <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
      {metas.map((meta) => {
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
              "rounded-md border px-2 py-1.5 text-left transition-colors",
              active
                ? "border-primary bg-accent"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent/50",
            )}
            title={`${meta.description ?? meta.label}\nClick to ${active ? "clear the" : "show only this"} level in the table below.`}
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
              <DeltaBadge delta={clickDelta} label={`${meta.label} clicks`} />
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-tight tabular-nums">
              {formatCount(queries)}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                kw
              </span>
            </p>
            <p className="truncate text-[10px] tabular-nums text-muted-foreground">
              {formatCount(clicks)} clicks · {formatCount(impressions)} impr.
              {totalClicks > 0 ? ` · ${share.toFixed(0)}%` : ""}
              {(totals?.overrideQueries ?? 0) > 0
                ? ` · ${formatCount(totals?.overrideQueries)} yours`
                : ""}
            </p>
          </button>
        );
      })}
    </div>
  );
}
