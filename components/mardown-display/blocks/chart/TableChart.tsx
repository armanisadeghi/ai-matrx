"use client";

/**
 * TableChart — "Chart this" for any table an answer shows (markdown table,
 * CSV/TSV block). Draws through the ONE chart primitive: `tableToChartSpec`
 * builds the same ChartSpec a ```chart fence parses to, and ChartCanvas (the
 * only recharts importer, loaded via next/dynamic ssr:false) draws it.
 *
 * `ChartThisButton` is ABSENT for a table with no numbers — never a dead
 * button. The panel auto-picks bar/line/pie/scatter and lets the reader switch
 * to any type the data can honestly draw.
 */

import React, { useState } from "react";
import dynamic from "next/dynamic";
import {
  AreaChart as AreaIcon,
  BarChart3,
  ChartScatter,
  LineChart as LineIcon,
  PieChart as PieIcon,
  X,
} from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { Button, ControlRow, SegmentedControl } from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";
import type { ChartType } from "./chart-spec";
import { chartNotice, chartableTypes, tableToChartSpec, type PlainTable } from "./table-chart";

const ChartCanvas = dynamic(() => import("./ChartCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const TYPE_META: Record<ChartType, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  bar: { label: "Bar", Icon: BarChart3 },
  line: { label: "Line", Icon: LineIcon },
  area: { label: "Area", Icon: AreaIcon },
  pie: { label: "Pie", Icon: PieIcon },
  scatter: { label: "Scatter", Icon: ChartScatter },
};

export function isChartable(table: PlainTable): boolean {
  return chartableTypes(table).length > 0;
}

export function ChartThisButton({
  table,
  active,
  onToggle,
  className,
}: {
  table: PlainTable;
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (!isChartable(table)) return null;
  return (
    <Button
      variant="outline"
      tone={active ? "primary" : undefined}
      icon={<BarChart3 />}
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? "Hide chart" : "Chart this table"}
      className={className}
    >
      {active ? "Hide chart" : "Chart this"}
    </Button>
  );
}

export function TableChartPanel({
  table,
  title,
  onClose,
  className,
}: {
  table: PlainTable;
  title?: string;
  onClose?: () => void;
  className?: string;
}) {
  const types = chartableTypes(table);
  const [picked, setPicked] = useState<ChartType | undefined>(undefined);
  const spec = tableToChartSpec(table, picked);
  if (!spec) return null;
  const notice = chartNotice(table, picked);
  const heading = title ?? `${TYPE_META[spec.type].label} chart`;

  return (
    <div
      className={cn("my-2 overflow-hidden rounded-lg border border-border bg-card", className)}
      data-find-ignore=""
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-2 py-1">
        <span className="truncate pl-1 text-sm font-medium text-foreground">{heading}</span>
        <ControlRow nowrap>
          <SegmentedControl
            aria-label="Chart type"
            value={picked ?? spec.type}
            onValueChange={setPicked}
            data={types.map((t) => {
              const { Icon, label } = TYPE_META[t];
              return { value: t, label: <Icon />, ariaLabel: `${label} chart`, title: `${label} chart` };
            })}
          />
          {onClose && (
            <Button variant="quiet" icon={<X />} aria-label="Close chart" title="Close chart" onClick={onClose} />
          )}
        </ControlRow>
      </div>
      {notice && (
        <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground" role="status">
          {notice}
        </p>
      )}
      <div className="h-[300px] w-full p-2">
        <ChartCanvas spec={spec} />
      </div>
    </div>
  );
}
