"use client";

/**
 * TelemetrySurface — human-visible usage/resource numbers (D-9).
 *
 * Measurement is a day-one requirement AND it must be visible to a human, not
 * just in a log. Anything not actually measured is labelled "not yet measured",
 * never rounded to 0.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Activity, RefreshCw, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TelemetryMetric, TelemetrySnapshot } from "../types";

function formatValue(m: TelemetryMetric): string {
  if (!m.measured || m.value === null) return "—";
  if (m.unit === "bytes") {
    const mb = m.value / 1_000_000;
    return `${mb >= 1000 ? (mb / 1000).toFixed(1) + " GB" : mb.toFixed(1) + " MB"}`;
  }
  if (m.unit === "USD") return `$${m.value.toFixed(2)}`;
  return `${m.value.toLocaleString()}${m.unit ? " " + m.unit : ""}`;
}

export function TelemetrySurface({
  telemetry,
  onRefresh,
  className,
}: {
  telemetry: TelemetrySnapshot | null;
  onRefresh?: () => void;
  className?: string;
}) {
  if (!telemetry) {
    return (
      <div className={cn("p-4 text-sm text-muted-foreground", className)}>
        Usage numbers load with the panel.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 p-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4" /> Usage &amp; resources
        </h3>
        {onRefresh ? (
          <Button size="sm" variant="ghost" onClick={onRefresh}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {telemetry.metrics.map((m) => (
          <div
            key={m.key}
            className={cn(
              "rounded-md border border-border bg-card px-3 py-2",
              !m.measured && "border-dashed opacity-80",
            )}
          >
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="truncate">{m.label}</span>
              {m.hint ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>{m.hint}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
              {formatValue(m)}
            </div>
            {!m.measured ? (
              <div className="text-[10px] font-medium uppercase tracking-wide text-amber-500">
                not yet measured
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Captured {new Date(telemetry.capturedAt).toLocaleTimeString()}. We collect this from the
        first release so measured usage — not a guessed number — sets the limits.
      </p>
    </div>
  );
}
