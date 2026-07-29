"use client";

// KPI hover peeks for the sites portfolio (/marketing/sites).
//
// Hovering a GSC number in the table opens a non-blocking HoverCard with the
// site's daily trend (30/90-day toggle) and its top pages by clicks — the
// "instant KPI drill-down" an SEO operator expects without leaving the list.
// Data loads lazily on first open via useSiteGscDaily / useSiteGscTopPages
// (5-minute staleTime, so re-hovers are free). The chart is a hand-rolled
// SVG — deliberately no charting library, so this stays out of heavy chunks
// (see the code-splitting skill; a peek must open instantly).

import { useMemo, useRef, useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, FileSearch, Loader2 } from "lucide-react";
import {
  useSiteGscDaily,
  useSiteGscTopPages,
} from "@/features/marketing/data/hooks";
import type {
  SiteGscDailyPoint,
  SiteListRow,
} from "@/features/marketing/types";

export type GscPeekMetric = "clicks" | "impressions" | "position";

const METRIC_LABEL: Record<GscPeekMetric, string> = {
  clicks: "Clicks",
  impressions: "Impressions",
  position: "Avg position",
};

/** 3,622 · 799.1K · 12.4M — exact below 100k, compact above. */
export function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) < 100_000) return Math.round(value).toLocaleString();
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPosition(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(1);
}

/** Percent change vs the prior 28-day window; null = not comparable. */
export function trendPercent(
  current: number | null,
  previous: number | null,
  prevDays: number,
): number | null {
  // A partial prior window (e.g. GSC history younger than 8 weeks) would
  // fabricate a huge "growth" number — suppress until coverage is near-full.
  if (current === null || previous === null || prevDays < 21) return null;
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function TrendDelta({
  percent,
  invert = false,
  className,
}: {
  percent: number | null;
  /** For metrics where lower is better (position). */
  invert?: boolean;
  className?: string;
}) {
  if (percent === null) return null;
  const up = percent >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-semibold tabular-nums",
        good
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-red-500/10 text-red-600 dark:text-red-400",
        className,
      )}
      title="vs previous 28 days"
    >
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(percent) >= 100
        ? `${Math.round(Math.abs(percent))}%`
        : `${Math.abs(percent).toFixed(1)}%`}
    </span>
  );
}

// ── Trend chart ─────────────────────────────────────────────────────────────

const CHART_W = 288;
const CHART_H = 72;
const CHART_PAD = 4;

/** Format a date-only value ("2026-07-26") without a UTC-midnight timezone
 *  shift — `formatCompactDate` would render it as the prior evening. */
export function formatStatDate(iso: string): string {
  return chartDateLabel(iso);
}

function chartDateLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Lightweight SVG area/line chart with a hover crosshair. `invert` flips the
 * scale for rank-style metrics (position: lower = better = higher on chart).
 */
export function MiniTrendChart({
  points,
  metric,
}: {
  points: SiteGscDailyPoint[];
  metric: GscPeekMetric;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const invert = metric === "position";

  const values = useMemo(
    () =>
      points.map((point) =>
        metric === "clicks"
          ? point.clicks
          : metric === "impressions"
            ? point.impressions
            : (point.avg_position ?? 0),
      ),
    [points, metric],
  );

  const geometry = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerH = CHART_H - CHART_PAD * 2;
    const stepX = CHART_W / (values.length - 1);
    const yFor = (value: number) => {
      const ratio = (value - min) / span;
      const fromTop = invert ? ratio : 1 - ratio;
      return CHART_PAD + fromTop * innerH;
    };
    const coords = values.map(
      (value, index) => [index * stepX, yFor(value)] as const,
    );
    const line = coords
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    const area = `${line} L${CHART_W},${CHART_H} L0,${CHART_H} Z`;
    return { coords, line, area, stepX, min, max };
  }, [values, invert]);

  if (!geometry) {
    return (
      <div className="flex h-[72px] items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
        Not enough daily data yet
      </div>
    );
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredValue = hoverIndex !== null ? values[hoverIndex] : null;

  return (
    <div>
      <div className="mb-1 flex h-4 items-baseline justify-between text-[10px] tabular-nums text-muted-foreground">
        {hovered && hoveredValue !== null ? (
          <>
            <span>{chartDateLabel(hovered.stat_date)}</span>
            <span className="font-semibold text-foreground">
              {metric === "position"
                ? formatPosition(hoveredValue)
                : formatMetric(hoveredValue)}
            </span>
          </>
        ) : (
          <>
            <span>{chartDateLabel(points[0].stat_date)}</span>
            <span>{chartDateLabel(points[points.length - 1].stat_date)}</span>
          </>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        className="h-[72px] w-full text-primary"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(event) => {
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect || rect.width === 0) return;
          const ratio = (event.clientX - rect.left) / rect.width;
          const index = Math.round(ratio * (points.length - 1));
          setHoverIndex(Math.min(points.length - 1, Math.max(0, index)));
        }}
      >
        <path d={geometry.area} fill="currentColor" opacity={0.12} />
        <path
          d={geometry.line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {hoverIndex !== null ? (
          <>
            <line
              x1={geometry.coords[hoverIndex][0]}
              x2={geometry.coords[hoverIndex][0]}
              y1={0}
              y2={CHART_H}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.35}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={geometry.coords[hoverIndex][0]}
              cy={geometry.coords[hoverIndex][1]}
              r={2.5}
              fill="currentColor"
            />
          </>
        ) : null}
      </svg>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-muted-foreground/70">
        <span>
          {invert ? "best " : "low "}
          {metric === "position"
            ? formatPosition(invert ? geometry.min : geometry.min)
            : formatMetric(geometry.min)}
        </span>
        <span>
          {invert ? "worst " : "high "}
          {metric === "position"
            ? formatPosition(geometry.max)
            : formatMetric(geometry.max)}
        </span>
      </div>
    </div>
  );
}

// ── GSC metric peek ─────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [30, 90] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

export function GscPeekBody({
  site,
  metric,
}: {
  site: SiteListRow;
  metric: GscPeekMetric;
}) {
  const [days, setDays] = useState<WindowDays>(90);
  const daily = useSiteGscDaily(site.id, days);
  const topPages = useSiteGscTopPages(site.id, days, 10);

  const windowTotal = useMemo(() => {
    const rows = daily.data ?? [];
    if (rows.length === 0) return null;
    if (metric === "clicks")
      return rows.reduce((sum, row) => sum + row.clicks, 0);
    if (metric === "impressions")
      return rows.reduce((sum, row) => sum + row.impressions, 0);
    let weight = 0;
    let weighted = 0;
    for (const row of rows) {
      if (row.avg_position === null) continue;
      const w = Math.max(row.impressions, 1);
      weight += w;
      weighted += row.avg_position * w;
    }
    return weight > 0 ? weighted / weight : null;
  }, [daily.data, metric]);

  const delta =
    metric === "clicks"
      ? trendPercent(site.gsc_clicks_28d, site.gsc_clicks_prev_28d, site.gsc_prev_days)
      : metric === "impressions"
        ? trendPercent(
            site.gsc_impressions_28d,
            site.gsc_impressions_prev_28d,
            site.gsc_prev_days,
          )
        : null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {METRIC_LABEL[metric]} · last {days} days
          </p>
          <p className="flex items-baseline gap-1.5 text-lg font-semibold tabular-nums text-foreground">
            {metric === "position"
              ? formatPosition(windowTotal)
              : formatMetric(windowTotal)}
            {metric !== "position" ? <TrendDelta percent={delta} /> : null}
          </p>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors",
                option === days
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {daily.isLoading ? (
        <div className="flex h-[72px] items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <MiniTrendChart points={daily.data ?? []} metric={metric} />
      )}

      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Top pages by clicks
        </p>
        {topPages.isLoading ? (
          <div className="flex h-10 items-center justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : (topPages.data?.length ?? 0) === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Google reports no page data in this window.
          </p>
        ) : (
          <div className="max-h-44 space-y-px overflow-y-auto">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
              <span>Page</span>
              <span className="w-10 text-right">Clicks</span>
              <span className="w-11 text-right">Impr</span>
              <span className="w-8 text-right">Pos</span>
            </div>
            {(topPages.data ?? []).map((page) => (
              <div
                key={page.page_id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 rounded px-1 py-0.5 text-[11px] tabular-nums hover:bg-muted/50"
                title={page.url}
              >
                <span className="truncate text-foreground">
                  {page.path || "/"}
                </span>
                <span className="w-10 text-right font-medium">
                  {formatMetric(page.clicks)}
                </span>
                <span className="w-11 text-right text-muted-foreground">
                  {formatMetric(page.impressions)}
                </span>
                <span className="w-8 text-right text-muted-foreground">
                  {formatPosition(page.avg_position)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {site.gsc_latest_date ? (
        <p className="text-[10px] text-muted-foreground/70">
          Google data through {chartDateLabel(site.gsc_latest_date)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Wrap a table cell's content so hovering it opens the metric peek.
 * The trigger renders inline; the peek mounts (and fetches) only on open.
 */
export function GscMetricPeek({
  site,
  metric,
  children,
}: {
  site: SiteListRow;
  metric: GscPeekMetric;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Nothing to peek at when Google has never reported for this site.
  if (site.pages_in_gsc === 0) return <>{children}</>;
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={250} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span className="inline-flex cursor-default underline-offset-4 hover:underline decoration-dotted decoration-muted-foreground/50">
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        side="bottom"
        className="w-[320px] p-3 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        {open ? <GscPeekBody site={site} metric={metric} /> : null}
      </HoverCardContent>
    </HoverCard>
  );
}

// ── Pages breakdown peek ────────────────────────────────────────────────────

export function PagesPeek({
  site,
  children,
}: {
  site: SiteListRow;
  children: React.ReactNode;
}) {
  const coverage =
    site.page_count > 0 ? (site.pages_in_gsc / site.page_count) * 100 : null;
  return (
    <HoverCard openDelay={250} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span className="inline-flex cursor-default underline-offset-4 hover:underline decoration-dotted decoration-muted-foreground/50">
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        side="bottom"
        className="w-64 p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <FileSearch className="h-3 w-3" /> Page inventory
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "Canonical", value: formatMetric(site.page_count) },
              { label: "In Google", value: formatMetric(site.pages_in_gsc) },
              { label: "Scored", value: formatMetric(site.scored_pages) },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-md border border-border/60 bg-muted/30 px-1.5 py-1 text-center"
              >
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {stat.value}
                </p>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
          {coverage !== null ? (
            <div>
              <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
                <span>Google coverage</span>
                <span className="tabular-nums">{coverage.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, coverage)}%` }}
                />
              </div>
            </div>
          ) : null}
          {site.health_score !== null ? (
            <p className="text-[11px] text-muted-foreground">
              Health {site.health_score.toFixed(1)}
              <span className="text-muted-foreground/60"> / 3</span> across{" "}
              {site.scored_pages.toLocaleString()} scored pages
            </p>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
