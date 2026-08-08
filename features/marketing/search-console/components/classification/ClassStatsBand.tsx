"use client";

/**
 * The live class scoreboard — one tile per traffic class (clicks /
 * impressions / query count for the review window) plus the Unclassified
 * countdown and an unconfirmed-rulings chip. Every ruling invalidates the
 * ["marketing","gsc"] query family, so these numbers move the moment a
 * classification lands — the gamification IS the live feedback loop
 * (Arman, 2026-08-08: watching the unclassified count fall and class
 * clicks/impressions grow is what makes the work exciting).
 *
 * Data: `gsc_perf_class_summary` (the SAME RPC behind the Insights
 * Traffic-quality table) — never a second aggregation.
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { useGscClassSummary } from "@/features/marketing/search-console/hooks/useGscQuery";
import type {
  GscDateRange,
  GscTrafficClass,
} from "@/features/marketing/search-console/types";
import {
  GSC_TRAFFIC_CLASSES,
  formatCount,
} from "@/features/marketing/search-console/types";

function previousWindow(range: GscDateRange): GscDateRange {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return { start: iso(prevStart), end: iso(prevEnd) };
}

export function ClassStatsBand({
  siteId,
  range,
  activeClass,
  onSelectClass,
  unconfirmedShown,
  onToggleUnconfirmed,
}: {
  siteId: string;
  range: GscDateRange;
  activeClass: GscTrafficClass | null;
  onSelectClass: (cls: GscTrafficClass | null) => void;
  unconfirmedShown: boolean;
  onToggleUnconfirmed: () => void;
}) {
  // The class-summary caller requires a compare window; the scoreboard uses
  // the previous period of the same length (deltas may surface here later).
  const summary = useGscClassSummary(siteId, {
    current: range,
    compare: previousWindow(range),
  });
  const rows = summary.data ?? [];
  const totalClicks = rows.reduce((acc, row) => acc + row.clicks, 0);
  const totalQueries = rows.reduce((acc, row) => acc + row.queries, 0);

  return (
    <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
      {GSC_TRAFFIC_CLASSES.map((meta) => {
        const row = rows.find((r) => r.traffic_class === meta.key);
        const clicks = row?.clicks ?? 0;
        const impressions = row?.impressions ?? 0;
        const queries = row?.queries ?? 0;
        const share = totalClicks > 0 ? (clicks / totalClicks) * 100 : 0;
        const isUnclassified = meta.key === "unclassified";
        const active = activeClass === meta.key;
        return (
          <button
            key={meta.key}
            type="button"
            className={cn(
              "rounded-lg border p-2 text-left transition-colors",
              active
                ? "border-primary bg-accent"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent/50",
              isUnclassified && queries > 0 && "border-warning/50",
            )}
            title={`${meta.description}\nClick to ${active ? "clear the" : "filter to this"} class.`}
            onClick={() => onSelectClass(active ? null : meta.key)}
          >
            <p
              className={cn(
                "text-[10px] font-medium uppercase tracking-wide",
                meta.tone,
              )}
            >
              {meta.label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-lg font-semibold tabular-nums leading-tight",
                isUnclassified && queries > 0 && "text-warning",
              )}
            >
              {formatCount(queries)}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                {isUnclassified ? "to review" : "keywords"}
              </span>
            </p>
            <p className="text-[10px] tabular-nums text-muted-foreground">
              {formatCount(clicks)} clicks · {formatCount(impressions)} impr.
              {!isUnclassified && totalClicks > 0
                ? ` · ${share.toFixed(0)}%`
                : ""}
            </p>
          </button>
        );
      })}
      <div className="col-span-2 flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2 sm:col-span-3 lg:col-span-6">
        <p className="text-[11px] text-muted-foreground">
          {totalQueries > 0 ? (
            <>
              <span className="font-semibold text-foreground">
                {formatCount(
                  totalQueries -
                    (rows.find((r) => r.traffic_class === "unclassified")
                      ?.queries ?? 0),
                )}
              </span>{" "}
              of {formatCount(totalQueries)} queries classified in this window
              — numbers update live as you rule.
            </>
          ) : (
            "No query data in this window yet."
          )}
        </p>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors",
            unconfirmedShown
              ? "border-warning bg-warning/10 text-warning"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title="Rulings applied automatically (rules, imports) that no human has confirmed yet"
          onClick={onToggleUnconfirmed}
        >
          <AlertTriangle className="h-3 w-3" />
          {unconfirmedShown ? "Showing unconfirmed only" : "Review unconfirmed"}
        </button>
      </div>
    </div>
  );
}
