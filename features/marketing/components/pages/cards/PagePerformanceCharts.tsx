"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  GscDailyPoint,
  PagePerformanceSample,
} from "@/features/marketing/pagespeed/data";
import { lighthouseScore } from "@/features/marketing/pagespeed/format";

const MOBILE_COLOR = "#4285f4";
const DESKTOP_COLOR = "#a855f7";
const CLICKS_COLOR = "#4285f4";
const IMPRESSIONS_COLOR = "#5e35b1";

interface HistoryPoint {
  observedAt: string;
  mobile: number | null;
  desktop: number | null;
}

export function buildPerformanceHistoryPoints(
  samples: readonly PagePerformanceSample[],
): HistoryPoint[] {
  return [...samples]
    .sort(
      (a, b) =>
        new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime(),
    )
    .map((sample) => ({
      observedAt: sample.observed_at,
      mobile:
        sample.strategy === "mobile"
          ? lighthouseScore(sample.performance_score)
          : null,
      desktop:
        sample.strategy === "desktop"
          ? lighthouseScore(sample.performance_score)
          : null,
    }));
}

function chartDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function HistoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HistoryPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  const rows = [
    { label: "Mobile", value: point.mobile, color: MOBILE_COLOR },
    { label: "Desktop", value: point.desktop, color: DESKTOP_COLOR },
  ].filter((row) => row.value !== null);
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">
        {chartDate(point.observedAt)}
      </p>
      {rows.map((row) => (
        <p
          key={row.label}
          className="flex items-center gap-2 text-muted-foreground"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: row.color }}
          />
          {row.label}: <strong className="text-foreground">{row.value}</strong>
        </p>
      ))}
    </div>
  );
}

export function PerformanceHistoryChart({
  samples,
}: {
  samples: readonly PagePerformanceSample[];
}) {
  const points = buildPerformanceHistoryPoints(samples);
  if (points.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
        Run another test later to reveal the performance trend.
      </div>
    );
  }
  const tickInterval = Math.max(0, Math.floor(points.length / 6) - 1);
  return (
    <div className="rounded-md border border-border p-2">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="observedAt"
            tickFormatter={chartDate}
            interval={tickInterval}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 90, 100]}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<HistoryTooltip />} />
          <Line
            type="monotone"
            dataKey="mobile"
            stroke={MOBILE_COLOR}
            strokeWidth={2}
            dot={points.length <= 6}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="desktop"
            stroke={DESKTOP_COLOR}
            strokeWidth={2}
            dot={points.length <= 6}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#4285f4]" />
          Mobile
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-purple-500" />
          Desktop
        </span>
      </div>
    </div>
  );
}

interface GscPoint extends GscDailyPoint {
  label: string;
}

function GscTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: GscPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{point.label}</p>
      <p className="text-muted-foreground">
        {point.clicks.toLocaleString()} clicks
      </p>
      <p className="text-muted-foreground">
        {point.impressions.toLocaleString()} impressions
      </p>
    </div>
  );
}

export function GscDailySparkline({
  daily,
}: {
  daily: readonly GscDailyPoint[];
}) {
  if (daily.length === 0) return null;
  const points: GscPoint[] = daily.map((point) => ({
    ...point,
    label: chartDate(`${point.date}T00:00:00`),
  }));
  return (
    <div className="rounded-md border border-border p-2">
      <ResponsiveContainer width="100%" height={96}>
        <LineChart
          data={points}
          margin={{ top: 5, right: 4, bottom: 0, left: 4 }}
        >
          <Tooltip content={<GscTooltip />} />
          <Line
            type="monotone"
            dataKey="clicks"
            stroke={CLICKS_COLOR}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="impressions"
            stroke={IMPRESSIONS_COLOR}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4285f4]" />
          Clicks
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5e35b1]" />
          Impressions
        </span>
      </div>
    </div>
  );
}
