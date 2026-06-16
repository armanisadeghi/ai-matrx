"use client";

/**
 * ChartCanvas — the recharts renderer for a normalized ChartSpec.
 *
 * IMPORTANT (bundle policy): recharts is heavy. This module is the ONLY place
 * that imports it, and it is loaded EXCLUSIVELY through
 * `next/dynamic(() => import("./ChartCanvas"), { ssr: false })` from ChartBlock,
 * rendered conditionally (only once a valid spec exists). So recharts never
 * enters the server build or the initial client bundle — it loads on demand,
 * client-side, the first time a chart actually renders.
 */

import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { CHART_PALETTE, type ChartSpec } from "./chart-spec";

const AXIS = { fontSize: 12, stroke: "var(--muted-foreground)" };
const GRID_STROKE = "var(--border)";

export default function ChartCanvas({ spec }: { spec: ChartSpec }) {
  const showLegend = spec.series.length > 1 || spec.type === "pie";

  return (
    <ResponsiveContainer width="100%" height="100%">
      {render(spec, showLegend)}
    </ResponsiveContainer>
  );
}

function render(spec: ChartSpec, showLegend: boolean): React.ReactElement {
  const common = { data: spec.data, margin: { top: 8, right: 16, bottom: 8, left: 0 } };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
      <XAxis dataKey={spec.xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
      <Tooltip
        contentStyle={{
          background: "var(--popover)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--popover-foreground)",
        }}
      />
      {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
    </>
  );

  switch (spec.type) {
    case "line":
      return (
        <LineChart {...common}>
          {axes}
          {spec.series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      );
    case "area":
      return (
        <AreaChart {...common}>
          {axes}
          {spec.series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.18}
              strokeWidth={2}
              stackId={spec.stacked ? "1" : undefined}
            />
          ))}
        </AreaChart>
      );
    case "scatter":
      return (
        <ScatterChart {...common}>
          {axes}
          <ZAxis range={[60, 60]} />
          {spec.series.map((s) => (
            <Scatter key={s.key} dataKey={s.key} name={s.label} fill={s.color} />
          ))}
        </ScatterChart>
      );
    case "pie": {
      const valueKey = spec.pie?.valueKey ?? "value";
      const labelKey = spec.pie?.labelKey ?? "label";
      return (
        <PieChart>
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
          />
          {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Pie
            data={spec.data}
            dataKey={valueKey}
            nameKey={labelKey}
            cx="50%"
            cy="50%"
            outerRadius="78%"
            innerRadius="0%"
            paddingAngle={1}
            label={(e: { name?: string; percent?: number }) =>
              `${e.name ?? ""} ${e.percent != null ? Math.round(e.percent * 100) : 0}%`
            }
            labelLine={false}
          >
            {spec.data.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      );
    }
    case "bar":
    default:
      return (
        <BarChart {...common}>
          {axes}
          {spec.series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} stackId={spec.stacked ? "1" : undefined} />
          ))}
        </BarChart>
      );
  }
}
