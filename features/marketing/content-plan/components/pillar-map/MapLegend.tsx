"use client";

/**
 * features/marketing/content-plan/components/pillar-map/MapLegend.tsx
 *
 * Compact always-available legend for the pillar map (toggleable from the
 * toolbar; rendered inside a React Flow <Panel> by PillarMap). Explains every
 * encoded dimension: color = status, shape = node type, size = priority,
 * dashed outline = needs reviewer, corner dot = primary keyword bound.
 * Chrome uses semantic tokens; swatches use the data palette by design.
 */
import { cn } from "@/lib/utils";

import { NODE_TYPE_LABELS, planStatusColor } from "../../constants";
import type { PlanNodeType } from "../../types";
import { PLAN_NODE_TYPES } from "../../types";
import { nodeShapeClass } from "./PlanMapNode";

const PRIORITY_LEGEND: { label: string; px: number }[] = [
  { label: "P1", px: 16 },
  { label: "P2", px: 12 },
  { label: "P3", px: 9 },
];

export function MapLegend({
  statuses,
}: {
  statuses: { slug: string; label: string }[];
}) {
  return (
    <div className="max-h-[45dvh] w-52 overflow-y-auto rounded-md border border-border bg-card/95 p-2.5 text-[10px] leading-tight text-foreground shadow-md backdrop-blur">
      <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
        Color · status
      </p>
      <div className="mb-2 grid grid-cols-2 gap-x-2 gap-y-1">
        {statuses.map((status) => (
          <span key={status.slug} className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                planStatusColor(status.slug),
              )}
            />
            <span className="truncate">{status.label}</span>
          </span>
        ))}
      </div>
      <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
        Shape · type
      </p>
      <div className="mb-2 grid grid-cols-2 gap-x-2 gap-y-1">
        {(PLAN_NODE_TYPES as readonly PlanNodeType[]).map((type) => (
          <span key={type} className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-3 w-3 shrink-0 bg-muted-foreground",
                nodeShapeClass(type),
                type === "home" && "ring-1 ring-offset-1",
              )}
            />
            <span>{NODE_TYPE_LABELS[type]}</span>
          </span>
        ))}
      </div>
      <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
        Size · priority
      </p>
      <div className="mb-2 flex items-end gap-2.5">
        {PRIORITY_LEGEND.map((entry) => (
          <span key={entry.label} className="flex flex-col items-center gap-0.5">
            <span
              className="rounded-full bg-muted-foreground"
              style={{ width: entry.px, height: entry.px }}
            />
            <span>{entry.label}</span>
          </span>
        ))}
      </div>
      <div className="space-y-1">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-sm outline-dashed outline-1 outline-offset-1 outline-violet-500" />
          <span>Needs reviewer</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-foreground" />
          <span>Primary keyword bound</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <span>Live on the site (Reality check)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-full border border-background bg-primary px-1 text-[8px] font-semibold leading-3 text-primary-foreground">
            +n
          </span>
          <span>Collapsed (double-click)</span>
        </span>
      </div>
    </div>
  );
}
