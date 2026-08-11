"use client";

import { XAxis } from "recharts";

export type CalendarPeriodMarkWeight = "month" | "quarter" | "year";

export interface CalendarPeriodMark {
  period: string;
  weight: CalendarPeriodMarkWeight;
  yearLabel: string | null;
}

/**
 * Classifies date-only period categories for a calendar axis. The first
 * visible period in every year owns the year label, so partial years still
 * retain their essential context.
 */
export function buildCalendarPeriodMarks(
  periods: readonly string[],
): ReadonlyMap<string, CalendarPeriodMark> {
  const marks = new Map<string, CalendarPeriodMark>();
  const labeledYears = new Set<number>();

  for (const period of periods) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(period);
    if (!match) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) continue;

    const isFirstPeriodInYear = !labeledYears.has(year);
    if (isFirstPeriodInYear) labeledYears.add(year);

    marks.set(period, {
      period,
      weight: isFirstPeriodInYear
        ? "year"
        : (month - 1) % 3 === 0
          ? "quarter"
          : "month",
      yearLabel: isFirstPeriodInYear ? String(year) : null,
    });
  }

  return marks;
}

function CalendarPeriodTick({
  x,
  y,
  payload,
  marks,
}: {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  marks: ReadonlyMap<string, CalendarPeriodMark>;
}) {
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (typeof payload?.value !== "string") return null;

  const mark = marks.get(payload.value);
  if (!mark) return null;

  const tickLength =
    mark.weight === "year" ? 11 : mark.weight === "quarter" ? 7 : 3;

  return (
    <g transform={`translate(${x},${y})`}>
      <line
        x1={0}
        x2={0}
        y1={0}
        y2={tickLength}
        stroke="var(--muted-foreground)"
        strokeOpacity={mark.weight === "month" ? 0.45 : 0.8}
        strokeWidth={mark.weight === "year" ? 1.5 : 1}
      />
      {mark.yearLabel ? (
        <text
          x={0}
          y={26}
          fill="var(--foreground)"
          fontSize={11}
          fontWeight={600}
          textAnchor="middle"
        >
          {mark.yearLabel}
        </text>
      ) : null}
    </g>
  );
}

/**
 * Recharts category axis for monthly historical data: every month is marked,
 * quarters are emphasized, and each visible year is explicitly labeled.
 */
export function CalendarPeriodAxis({
  dataKey,
  periods,
}: {
  dataKey: string;
  periods: readonly string[];
}) {
  const marks = buildCalendarPeriodMarks(periods);

  return (
    <XAxis
      dataKey={dataKey}
      interval={0}
      height={36}
      tick={<CalendarPeriodTick marks={marks} />}
      axisLine={{ stroke: "var(--border)" }}
      tickLine={false}
    />
  );
}
