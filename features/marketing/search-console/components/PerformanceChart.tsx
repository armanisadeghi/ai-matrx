"use client";

/**
 * The GSC-parity performance timeseries — recharts ComposedChart with one
 * line per visible metric (clicks / impressions / CTR / position, colors
 * matching the KPI tiles), dashed compare-period overlay aligned by day
 * index, an inverted axis for position (lower is better), and a rich
 * tooltip. Chart data carries its own CopyButtons.
 *
 * recharts stays INSIDE the workspace's single dynamic edge (Fragmentation
 * Law) — never import this file from statically-rendered chrome.
 */

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type {
  GscFilters,
  GscMetric,
  GscResolvedPeriods,
  GscTimeseriesRow,
} from "@/features/marketing/search-console/types";
import {
  GSC_METRICS,
  formatCount,
  formatCtr,
  formatPosition,
} from "@/features/marketing/search-console/types";
import { gscTimeseriesCopy } from "@/features/marketing/search-console/lib/copy-payloads";

interface ChartPoint {
  day: string;
  compareDay: string | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  cmp_clicks: number | null;
  cmp_impressions: number | null;
  cmp_ctr: number | null;
  cmp_position: number | null;
}

function buildPoints(
  rows: GscTimeseriesRow[],
  periods: GscResolvedPeriods,
): ChartPoint[] {
  const currentByDay = new Map(
    rows.filter((r) => r.period === "current").map((r) => [r.day, r]),
  );
  const compareByDay = new Map(
    rows.filter((r) => r.period === "compare").map((r) => [r.day, r]),
  );
  // Walk every calendar day of the current window so gaps render as gaps —
  // never silently connected lines over missing days.
  const points: ChartPoint[] = [];
  const start = new Date(`${periods.current.start}T00:00:00Z`);
  const end = new Date(`${periods.current.end}T00:00:00Z`);
  const compareStart = periods.compare
    ? new Date(`${periods.compare.start}T00:00:00Z`)
    : null;
  for (
    let t = start.getTime(), i = 0;
    t <= end.getTime();
    t += 86_400_000, i += 1
  ) {
    const day = new Date(t).toISOString().slice(0, 10);
    const cur = currentByDay.get(day);
    const compareDay = compareStart
      ? new Date(compareStart.getTime() + i * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : null;
    const cmp = compareDay ? compareByDay.get(compareDay) : undefined;
    points.push({
      day,
      compareDay,
      clicks: cur?.clicks ?? null,
      impressions: cur?.impressions ?? null,
      ctr: cur?.ctr ?? null,
      position: cur?.avg_position ?? null,
      cmp_clicks: cmp?.clicks ?? null,
      cmp_impressions: cmp?.impressions ?? null,
      cmp_ctr: cmp?.ctr ?? null,
      cmp_position: cmp?.avg_position ?? null,
    });
  }
  return points;
}

function formatMetricValue(metric: GscMetric, value: number | null): string {
  if (value === null) return "—";
  if (metric === "ctr") return formatCtr(value);
  if (metric === "position") return formatPosition(value);
  return formatCount(value);
}

function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function ChartTooltip({
  active,
  payload,
  visibleMetrics,
  hasCompare,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  visibleMetrics: readonly GscMetric[];
  hasCompare: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{shortDay(point.day)}</p>
      <div className="space-y-0.5">
        {GSC_METRICS.filter((m) => visibleMetrics.includes(m.key)).map((m) => (
          <div key={m.key} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: m.color }}
            />
            <span className="text-muted-foreground">{m.label}:</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatMetricValue(m.key, point[m.key])}
            </span>
            {hasCompare ? (
              <span className="tabular-nums text-muted-foreground">
                (
                {formatMetricValue(
                  m.key,
                  point[`cmp_${m.key}` as keyof ChartPoint] as number | null,
                )}
                {point.compareDay ? ` on ${shortDay(point.compareDay)}` : ""})
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PerformanceChart({
  siteId,
  siteName,
  periods,
  filters,
  rows,
  visibleMetrics,
  height = 260,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  filters: GscFilters;
  rows: GscTimeseriesRow[];
  visibleMetrics: readonly GscMetric[];
  height?: number;
}) {
  const points = useMemo(() => buildPoints(rows, periods), [rows, periods]);
  const hasCompare = periods.compare !== null;
  const copy = gscTimeseriesCopy({ siteId, siteName, periods, filters, rows });
  const tickInterval = Math.max(0, Math.floor(points.length / 8) - 1);

  return (
    <div className="group/chart relative rounded-md border border-border bg-card p-2">
      <div className="pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover/chart:pointer-events-auto group-hover/chart:opacity-100">
        <CopyButtons
          size="xs"
          label={copy.label}
          human={copy.human}
          agent={copy.agent}
          json={() => rows}
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            interval={tickInterval}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="clicks"
            hide={!visibleMetrics.includes("clicks")}
            width={40}
            tick={{ fontSize: 10, fill: "#4285f4" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatCount(v)}
          />
          <YAxis
            yAxisId="impressions"
            orientation="right"
            hide={!visibleMetrics.includes("impressions")}
            width={44}
            tick={{ fontSize: 10, fill: "#5e35b1" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatCount(v)}
          />
          <YAxis yAxisId="ctr" hide domain={[0, "auto"]} />
          {/* Position: lower is better — inverted so improvement points up. */}
          <YAxis yAxisId="position" hide reversed domain={["auto", "auto"]} />
          <Tooltip
            content={
              <ChartTooltip
                visibleMetrics={visibleMetrics}
                hasCompare={hasCompare}
              />
            }
          />
          {GSC_METRICS.filter((m) => visibleMetrics.includes(m.key)).map(
            (m) => (
              <Line
                key={m.key}
                yAxisId={m.key}
                type="monotone"
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={2}
                dot={points.length <= 2}
                connectNulls={false}
                isAnimationActive={false}
              />
            ),
          )}
          {hasCompare
            ? GSC_METRICS.filter((m) => visibleMetrics.includes(m.key)).map(
                (m) => (
                  <Line
                    key={`cmp_${m.key}`}
                    yAxisId={m.key}
                    type="monotone"
                    dataKey={`cmp_${m.key}`}
                    stroke={m.color}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    strokeOpacity={0.55}
                    dot={points.length <= 2}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ),
              )
            : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
