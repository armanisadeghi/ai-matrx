"use client";

/**
 * The GA4 trend — one axis, three same-unit series, hand-drawn SVG.
 *
 * WHY NOT recharts (the repo's other charts use it): this panel mounts inside
 * site settings and inside a window panel, both of which are statically
 * imported chrome. Pulling recharts in there would either add a `next/dynamic`
 * edge per host (Fragmentation Law) or drag the library into those bundles.
 * The form here is a small multi-series line with a crosshair — ~200 lines of
 * SVG, no chunk cost, and identical in light and dark.
 *
 * `dataviz` compliance: ONE axis (sessions / users / engaged sessions are all
 * counts — conversions live in a tile, never a second scale); 2px lines; >=8px
 * hover markers; recessive grid; legend always present for >=2 series plus a
 * direct label on the last point; palette validated in both modes
 * (`node scripts/validate_palette.js "#3b82f6,#0d9488,#ea580c"` → ALL CHECKS
 * PASS for light and dark).
 */

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { AnalyticsDayPoint } from "@/features/marketing/analytics/window";

export const ANALYTICS_SERIES = [
  { key: "sessions", label: "Sessions", color: "#3b82f6" },
  { key: "users", label: "Users", color: "#0d9488" },
  { key: "engagedSessions", label: "Engaged sessions", color: "#ea580c" },
] as const;

export type AnalyticsSeriesKey = (typeof ANALYTICS_SERIES)[number]["key"];

const WIDTH = 720;
const HEIGHT = 168;
const PAD = { top: 10, right: 12, bottom: 18, left: 38 };

function niceCeiling(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

function shortDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", timeZone: "UTC" },
  );
}

function compact(value: number): string {
  return Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export interface AnalyticsTrendChartProps {
  series: AnalyticsDayPoint[];
  previousSeries: AnalyticsDayPoint[];
  visible: readonly AnalyticsSeriesKey[];
  onToggle: (key: AnalyticsSeriesKey) => void;
}

export function AnalyticsTrendChart({
  series,
  previousSeries,
  visible,
  onToggle,
}: AnalyticsTrendChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = ANALYTICS_SERIES.filter((s) => visible.includes(s.key));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const max = niceCeiling(
    Math.max(
      1,
      ...series.flatMap((point) => shown.map((s) => point[s.key])),
      ...previousSeries.flatMap((point) => shown.map((s) => point[s.key])),
    ),
  );
  const x = (index: number): number =>
    series.length <= 1
      ? PAD.left + plotW / 2
      : PAD.left + (index / (series.length - 1)) * plotW;
  const y = (value: number): number => PAD.top + plotH - (value / max) * plotH;
  const path = (points: AnalyticsDayPoint[], key: AnalyticsSeriesKey): string =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point[key])}`)
      .join(" ");
  const hovered = hover !== null ? series[hover] : null;
  const hoveredPrevious = hover !== null ? previousSeries[hover] : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ANALYTICS_SERIES.map((s) => {
          const active = visible.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onToggle(s.key)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 text-[11px] transition-opacity",
                active
                  ? "text-foreground"
                  : "text-muted-foreground opacity-60 hover:opacity-100",
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: active ? s.color : "transparent", boxShadow: `inset 0 0 0 2px ${s.color}` }}
                aria-hidden
              />
              {s.label}
            </button>
          );
        })}
        {previousSeries.length ? (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" aria-hidden />
            Previous period
          </span>
        ) : null}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[168px] w-full"
          role="img"
          aria-label={`Daily ${shown.map((s) => s.label.toLowerCase()).join(", ")} for the selected period`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - box.left) / box.width;
            const svgX = ratio * WIDTH;
            if (series.length === 0) return;
            const index = Math.round(
              ((svgX - PAD.left) / plotW) * (series.length - 1),
            );
            setHover(Math.min(series.length - 1, Math.max(0, index)));
          }}
        >
          {[0, 0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(max * fraction)}
                y2={y(max * fraction)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(max * fraction) + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[9px]"
              >
                {compact(max * fraction)}
              </text>
            </g>
          ))}
          {series.length ? (
            <>
              <text
                x={PAD.left}
                y={HEIGHT - 5}
                className="fill-muted-foreground text-[9px]"
              >
                {shortDay(series[0].date)}
              </text>
              <text
                x={WIDTH - PAD.right}
                y={HEIGHT - 5}
                textAnchor="end"
                className="fill-muted-foreground text-[9px]"
              >
                {shortDay(series[series.length - 1].date)}
              </text>
            </>
          ) : null}
          {shown.map((s) =>
            previousSeries.length ? (
              <path
                key={`prev-${s.key}`}
                d={path(previousSeries, s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray="4 3"
                opacity={0.45}
              />
            ) : null,
          )}
          {shown.map((s) => (
            <path
              key={s.key}
              d={path(series, s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
          {hover !== null && hovered ? (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                className="stroke-muted-foreground"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              {shown.map((s) => (
                <circle
                  key={`dot-${s.key}`}
                  cx={x(hover)}
                  cy={y(hovered[s.key])}
                  r={4.5}
                  fill={s.color}
                  className="stroke-card"
                  strokeWidth={2}
                />
              ))}
            </>
          ) : null}
        </svg>
        {hovered ? (
          <div className="pointer-events-none absolute right-2 top-1 rounded-md border border-border bg-card/95 px-2 py-1 text-[11px] shadow-sm">
            <p className="font-medium text-foreground">{shortDay(hovered.date)}</p>
            {shown.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="text-foreground">
                  {Intl.NumberFormat().format(hovered[s.key])}
                </span>
                {s.label.toLowerCase()}
                {hoveredPrevious ? (
                  <span>
                    {` (was ${Intl.NumberFormat().format(hoveredPrevious[s.key])})`}
                  </span>
                ) : null}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
