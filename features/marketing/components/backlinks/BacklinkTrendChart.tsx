"use client";

/**
 * New/lost backlink trend — recharts ComposedChart modeled on the GSC
 * PerformanceChart: diverging new/lost bars around zero (sign-stacked) on the
 * left axis, running total/referring-domain lines on the right axis, rich
 * tooltip, worded legend. Zero-valued periods render as zero-height bars —
 * never dropped (the old SVG's falsy checks skipped them).
 *
 * recharts stays INSIDE the route's single dynamic edge (BacklinksGate) —
 * never import this file from statically-rendered chrome.
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import { humanTrend } from "@/features/marketing/components/backlinks/format";
import { backlinkEmptyHint } from "@/features/marketing/components/backlinks/lib/vocab";
import type { BacklinkTrendPoint } from "@/features/marketing/data/backlinks-types";

const NEW_COLOR = "var(--color-success)";
const LOST_COLOR = "var(--color-destructive)";
const TOTAL_COLOR = "#4285f4";
const DOMAINS_COLOR = "#5e35b1";

interface TrendChartPoint {
  period: string;
  new_links: number;
  /** Stored negative so the bar renders below zero (diverging look). */
  lost_links: number;
  total_backlinks: number | null;
  referring_domains: number | null;
}

function buildPoints(points: BacklinkTrendPoint[]): TrendChartPoint[] {
  return points.map((point) => ({
    period: point.observed_at,
    new_links: point.new_backlinks ?? 0,
    lost_links: -(point.lost_backlinks ?? 0),
    total_backlinks: point.total_backlinks,
    referring_domains: point.referring_domains,
  }));
}

function compactCount(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

/** Month/day tick, read in UTC — observed_at is a date-only provider period. */
function shortPeriod(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const lost = Math.abs(point.lost_links);
  const rows: Array<{ label: string; value: string; color: string }> = [
    {
      label: "New links",
      value: `+${point.new_links.toLocaleString()}`,
      color: NEW_COLOR,
    },
    {
      label: "Lost links",
      value: `−${lost.toLocaleString()}`,
      color: LOST_COLOR,
    },
    {
      label: "Total backlinks",
      value:
        point.total_backlinks === null
          ? "—"
          : point.total_backlinks.toLocaleString(),
      color: TOTAL_COLOR,
    },
    {
      label: "Referring domains",
      value:
        point.referring_domains === null
          ? "—"
          : point.referring_domains.toLocaleString(),
      color: DOMAINS_COLOR,
    },
  ];
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">
        Up to {formatGscDate(point.period)}
      </p>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className="text-muted-foreground">{row.label}:</span>
            <span className="font-medium tabular-nums text-foreground">
              {row.value}
            </span>
          </div>
        ))}
        <p className="pt-0.5 text-muted-foreground">
          Overall {point.new_links - lost >= 0 ? "+" : ""}
          {(point.new_links - lost).toLocaleString()} in this period
        </p>
      </div>
    </div>
  );
}

export function BacklinkTrendChart({
  points,
  siteDomain,
  location,
  height = 260,
}: {
  points: BacklinkTrendPoint[];
  siteDomain: string;
  location: string;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center px-4 text-center text-xs text-muted-foreground"
        style={{ height }}
      >
        {backlinkEmptyHint("any history of links gained and lost")}
      </div>
    );
  }

  const data = buildPoints(points);
  const tickInterval = Math.max(0, Math.floor(data.length / 8) - 1);

  return (
    <div className="group/chart relative p-2">
      <div className="pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover/chart:pointer-events-auto group-hover/chart:opacity-100">
        <CopyButtons
          size="xs"
          label={`Backlink trend (${siteDomain})`}
          human={() => humanTrend(points)}
          json={() => points}
          agent={(): AgentPayloadInput => ({
            kind: "backlink-trend",
            location,
            description: `The stored new/lost backlink timeseries for ${siteDomain}.`,
            data: points,
            summary: humanTrend(points),
            attributes: { periods: points.length },
          })}
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          stackOffset="sign"
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="period"
            tickFormatter={shortPeriod}
            interval={tickInterval}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="delta"
            width={44}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => compactCount(Math.abs(value))}
          />
          <YAxis
            yAxisId="totals"
            orientation="right"
            width={48}
            tick={{ fontSize: 10, fill: TOTAL_COLOR }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => compactCount(value)}
          />
          <ReferenceLine
            yAxisId="delta"
            y={0}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <Tooltip content={<ChartTooltip />} />
          <Bar
            yAxisId="delta"
            stackId="delta"
            dataKey="new_links"
            fill={NEW_COLOR}
            maxBarSize={18}
            isAnimationActive={false}
          />
          <Bar
            yAxisId="delta"
            stackId="delta"
            dataKey="lost_links"
            fill={LOST_COLOR}
            maxBarSize={18}
            isAnimationActive={false}
          />
          <Line
            yAxisId="totals"
            type="monotone"
            dataKey="total_backlinks"
            stroke={TOTAL_COLOR}
            strokeWidth={2}
            dot={data.length <= 2}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="totals"
            type="monotone"
            dataKey="referring_domains"
            stroke={DOMAINS_COLOR}
            strokeWidth={1.5}
            dot={data.length <= 2}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: NEW_COLOR }}
          />
          Links gained (bars above the line)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: LOST_COLOR }}
          />
          Links lost (bars below the line)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: TOTAL_COLOR }}
          />
          Total backlinks (right axis)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: DOMAINS_COLOR }}
          />
          Referring domains (right axis)
        </span>
      </div>
    </div>
  );
}
