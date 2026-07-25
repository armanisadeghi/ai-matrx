"use client";

/**
 * Keyword-research body for the `seo` tool (action=keyword_data).
 *
 * Built entirely on the core keyword primitives in
 * `features/marketing/seo/keyword-research/components/KeywordMetrics` — the SAME
 * sparkline, competition badge and number formats the Keyword Research
 * workbench renders, so the tool result and the workbench can never drift.
 *
 * Inline is the scan view (one row per keyword, sorted by volume); the overlay
 * adds the 12-month trend detail and the search parameters. Nothing is hidden:
 * every keyword row is present in the overlay.
 */

import { Globe, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  KeywordCompetitionBadge,
  KeywordTrendBadge,
  KeywordTrendSparkline,
  formatCpc,
  formatSearchVolume,
  monthlySearchTrend,
} from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import type {
  SeoKeywordDataResult,
  SeoKeywordDatum,
} from "@/features/marketing/seo/keyword-research/types";

const INLINE_LIMIT = 8;

/** Oldest-first, last 12 months — the order the sparkline reads. */
function trendPoints(datum: SeoKeywordDatum) {
  return datum.monthly_searches.slice(0, 12).reverse();
}

function byVolume(a: SeoKeywordDatum, b: SeoKeywordDatum) {
  return b.search_volume - a.search_volume;
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

// ─── inline ──────────────────────────────────────────────────────────────────

export function KeywordDataInlineBody({
  data,
  onOpenOverlay,
}: {
  data: SeoKeywordDataResult;
  onOpenOverlay?: () => void;
}) {
  const rows = [...data.keywords_data].sort(byVolume);
  const shown = rows.slice(0, INLINE_LIMIT);
  const hidden = rows.length - shown.length;
  const totalVolume = rows.reduce((sum, row) => sum + row.search_volume, 0);

  return (
    <div className="divide-y divide-border/60">
      <div className="flex items-center gap-4 px-4 py-2">
        <span className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatSearchVolume(totalVolume)}
          </span>
          <span className="text-xs text-muted-foreground">
            combined monthly searches
          </span>
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 px-4 py-1.5">
        <ColumnHeader>Keyword</ColumnHeader>
        <ColumnHeader>Volume</ColumnHeader>
        <ColumnHeader>Trend</ColumnHeader>
        <ColumnHeader>CPC</ColumnHeader>
      </div>

      {shown.map((row) => (
        <div
          key={row.keyword}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 px-4 py-2"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm text-foreground">
              {row.keyword}
            </span>
            <KeywordCompetitionBadge
              competition={row.competition}
              competitionIndex={row.competition_index}
            />
          </span>
          <span className="text-right text-sm font-medium tabular-nums text-foreground">
            {formatSearchVolume(row.search_volume)}
          </span>
          <KeywordTrendSparkline points={trendPoints(row)} className="h-5" />
          <span className="text-right text-sm tabular-nums text-muted-foreground">
            {formatCpc(row.cpc)}
          </span>
        </div>
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenOverlay?.();
          }}
          disabled={!onOpenOverlay}
          className="flex w-full items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:pointer-events-none"
        >
          <TrendingUp className="size-3.5" />
          {hidden} more keyword{hidden === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

// ─── overlay ─────────────────────────────────────────────────────────────────

export function KeywordDataOverlayBody({ data }: { data: SeoKeywordDataResult }) {
  const rows = [...data.keywords_data].sort(byVolume);
  const { from, to } = data.date_range;
  const { location_code, language_code } = data.search_parameters;

  return (
    <div className="h-full w-full overflow-y-auto bg-muted/30 p-4">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-5 py-4">
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {rows.length}
          </span>
          <span className="text-sm text-muted-foreground">keywords</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {formatSearchVolume(
              rows.reduce((sum, row) => sum + row.search_volume, 0),
            )}
          </span>
          <span className="text-sm text-muted-foreground">monthly searches</span>
        </span>
        {from && to && (
          <span className="text-sm text-muted-foreground">
            {from} → {to}
          </span>
        )}
        {(location_code || language_code) && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="size-3.5" />
            {[location_code, language_code].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] items-center gap-x-6 border-b border-border px-5 py-2.5">
          <ColumnHeader>Keyword</ColumnHeader>
          <ColumnHeader>Volume</ColumnHeader>
          <ColumnHeader>12-month trend</ColumnHeader>
          <ColumnHeader>Competition</ColumnHeader>
          <ColumnHeader>CPC</ColumnHeader>
        </div>
        {rows.map((row, index) => {
          const points = trendPoints(row);
          return (
            <div
              key={row.keyword}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] items-center gap-x-6 px-5 py-3",
                index > 0 && "border-t border-border/60",
              )}
            >
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {row.keyword}
              </span>
              <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                {formatSearchVolume(row.search_volume)}
              </span>
              <span className="flex items-center gap-3">
                <KeywordTrendSparkline points={points} className="h-8" />
                <KeywordTrendBadge percent={monthlySearchTrend(points)} />
              </span>
              <KeywordCompetitionBadge
                competition={row.competition}
                competitionIndex={row.competition_index}
              />
              <span className="text-right text-sm tabular-nums text-muted-foreground">
                {formatCpc(row.cpc)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
