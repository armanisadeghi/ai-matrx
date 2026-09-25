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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChartType } from "./chart-spec";
import { chartableTypes, tableToChartSpec, type PlainTable } from "./table-chart";

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
      size="sm"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? "Hide chart" : "Chart this table"}
      className={cn("flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-800/30", active && "bg-primary/10 text-primary", className)}
    >
      <BarChart3 className="h-4 w-4" />
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
  const heading = title ?? `${TYPE_META[spec.type].label} chart`;

  return (
    <div
      className={cn("my-2 overflow-hidden rounded-lg border border-border bg-card", className)}
      data-find-ignore=""
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-2 py-1">
        <span className="truncate pl-1 text-sm font-medium text-foreground">{heading}</span>
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Chart type">
          {types.map((t) => {
            const { Icon, label } = TYPE_META[t];
            const on = spec.type === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${label} chart`}
                title={`${label} chart`}
                onClick={() => setPicked(t)}
                className={cn(
                  "rounded p-1.5 transition-colors",
                  on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
          {onClose && (
            <button
              type="button"
              aria-label="Close chart"
              title="Close chart"
              onClick={onClose}
              className="ml-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="h-[300px] w-full p-2">
        <ChartCanvas spec={spec} />
      </div>
    </div>
  );
}
