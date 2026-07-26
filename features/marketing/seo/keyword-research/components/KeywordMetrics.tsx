"use client";

/**
 * KeywordMetrics — THE shared presentation primitives for keyword volume data.
 *
 * One implementation consumed by every keyword surface: the Keyword Research
 * workbench (live `seo.keyword_market` rows) and the `seo` tool renderer
 * (action=keyword_data payloads). Both speak `MonthlySearchPoint[]` + plain
 * numbers, so neither owns a private copy of a sparkline or a volume format.
 *
 * Extracted from KeywordResearchWorkbench 2026-07-25 when the tool renderer
 * needed the same visuals — generalized from `KeywordMarketRow` to primitives
 * so any caller with numbers can use them.
 */

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MonthlySearchPoint } from "../types";

/** Compact volume: 12300 -> "12.3k". `null`/`undefined` -> em dash. */
export function formatSearchVolume(
  volume: number | null | undefined,
): string {
  if (volume === null || volume === undefined) return "—";
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}k`;
  return String(volume);
}

/** Cost-per-click as currency. `0` is a real value ("$0.00"), not a blank. */
export function formatCpc(cpc: number | null | undefined): string {
  if (cpc === null || cpc === undefined) return "—";
  return `$${Number(cpc).toFixed(2)}`;
}

/**
 * Trend of the most recent points vs the ones before them, as a percentage.
 * Returns `null` when there isn't enough history to say anything honest.
 */
export function monthlySearchTrend(
  points: MonthlySearchPoint[],
  window = 3,
): number | null {
  if (points.length < window * 2) return null;
  const recent = points.slice(-window);
  const prior = points.slice(-window * 2, -window);
  const sum = (list: MonthlySearchPoint[]) =>
    list.reduce((total, point) => total + point.search_volume, 0);
  const priorTotal = sum(prior);
  if (priorTotal === 0) return null;
  return ((sum(recent) - priorTotal) / priorTotal) * 100;
}

/**
 * 12-month volume sparkline — one series, so no legend; the caller's label
 * names it. Bars carry a native tooltip with the exact month + volume, so the
 * numbers are never color-alone.
 */
export function KeywordTrendSparkline({
  points,
  className,
  barClassName,
}: {
  points: MonthlySearchPoint[];
  className?: string;
  barClassName?: string;
}) {
  if (points.length < 2) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const max = Math.max(...points.map((point) => point.search_volume), 1);
  return (
    <div className={cn("flex h-6 items-end gap-px", className)}>
      {points.map((point, index) => (
        <div
          key={`${point.year}-${point.month}-${index}`}
          className={cn("w-1.5 rounded-sm bg-primary/60", barClassName)}
          style={{
            height: `${Math.max(8, (point.search_volume / max) * 100)}%`,
          }}
          title={`${point.year}-${String(point.month).padStart(2, "0")}: ${point.search_volume.toLocaleString()}`}
        />
      ))}
    </div>
  );
}

/**
 * Competition tier + index. Tier text is humanized ("HIGH" -> "High") and
 * carries its own label, so severity never reads from color alone.
 */
export function KeywordCompetitionBadge({
  competition,
  competitionIndex,
  className,
}: {
  competition: string | null | undefined;
  competitionIndex?: number | null;
  className?: string;
}) {
  if (!competition) return <span className="text-muted-foreground">—</span>;
  const tier = competition.toUpperCase();
  const tone =
    tier === "HIGH"
      ? "text-destructive"
      : tier === "MEDIUM"
        ? "text-warning"
        : tier === "LOW"
          ? "text-success"
          : "text-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span className={cn("font-medium", tone)}>
        {tier.charAt(0) + tier.slice(1).toLowerCase()}
      </span>
      {competitionIndex !== null && competitionIndex !== undefined && (
        <span className="text-muted-foreground">{competitionIndex}</span>
      )}
    </span>
  );
}

const INTENT_CHIP_CLASSES: Record<string, string> = {
  transactional: "border-primary/50 bg-primary/10 text-primary",
  commercial_investigation: "border-primary/30 bg-primary/5 text-foreground",
  informational: "border-border bg-muted text-muted-foreground",
  navigational: "border-border bg-muted text-muted-foreground",
};

/**
 * Search-intent chip — THE one way `intent_class` renders anywhere
 * (classification stream cards, explorer tables, pickers). Color-coded by
 * class, humanized text, null -> "unclassified" muted chip (pass
 * `hideUnclassified` to render nothing instead).
 */
export function KeywordIntentChip({
  intentClass,
  hideUnclassified = false,
  className,
}: {
  intentClass: string | null | undefined;
  hideUnclassified?: boolean;
  className?: string;
}) {
  if (!intentClass) {
    if (hideUnclassified) return null;
    return (
      <span
        className={cn(
          "inline-flex rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground",
          className,
        )}
      >
        unclassified
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        INTENT_CHIP_CLASSES[intentClass] ??
          "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {intentClass.replace(/_/g, " ")}
    </span>
  );
}

/** 0-100 confidence meter: tiny bar + tabular number, tooltip carries the label. */
export function KeywordConfidenceMeter({
  value,
  label = "Overall confidence",
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={`${label} ${clamped}%`}
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary/70"
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {clamped}
      </span>
    </span>
  );
}

/** Direction chip for a percentage trend. */
export function KeywordTrendBadge({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  const rising = percent > 5;
  const falling = percent < -5;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        rising
          ? "text-success"
          : falling
            ? "text-destructive"
            : "text-muted-foreground",
      )}
    >
      {rising ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : falling ? (
        <ArrowDownRight className="h-3.5 w-3.5" />
      ) : null}
      {percent > 0 ? "+" : ""}
      {percent.toFixed(0)}%
    </span>
  );
}
