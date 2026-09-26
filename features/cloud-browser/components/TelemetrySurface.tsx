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
import Link from "next/link";
import { HouseWifi } from "lucide-react";
import { formatFileSize } from "@ai-matrx/kit/format";
import type {
  EgressUnavailable,
  RunEgress,
  TelemetryMetric,
  TelemetrySnapshot,
} from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

function formatValue(m: TelemetryMetric): string {
  if (!m.measured || m.value === null) return "—";
  // Bytes are formatFileSize's, whatever the unit turns out to be. The body
  // this replaced divided by 1_000_000 and had no B or KB tier at all, so a
  // 4 KB transfer rendered "0.0 MB" — a confident wrong zero, which is the one
  // thing this package exists to forbid.
  if (m.unit === "bytes") return formatFileSize(m.value);
  if (m.unit === "USD") return `$${m.value.toFixed(2)}`;
  return `${m.value.toLocaleString()}${m.unit ? " " + m.unit : ""}`;
}

/**
 * WHERE THE BROWSING WENT OUT (residential-egress contract, rule 5: announce,
 * never hide). Both halves are guarded on presence, so a run from before the
 * server half deploys renders exactly what it renders today.
 */
function EgressLine({
  egress,
  unavailable,
}: {
  egress: RunEgress | null | undefined;
  unavailable: EgressUnavailable | null | undefined;
}) {
  if (egress?.kind === "residential") {
    return (
      <p className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-foreground">
        <HouseWifi className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        Browsing through {egress.deviceName ?? "your own computer"} — a site
        turned away our servers, so this page came in over your own connection.
      </p>
    );
  }
  if (unavailable) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
        <HouseWifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {unavailable.message ??
            "A site blocked our servers and we could not open it another way."}
          <ErrorAlchemyMenu />
        </span>
        {/* A detected problem ships its own fix — a door, never a dead end. */}
        <Link
          href="/connect-computer"
          className="font-medium underline underline-offset-2"
        >
          Set up a home connection
        </Link>
      </div>
    );
  }
  return null;
}

export function TelemetrySurface({
  telemetry,
  egress,
  egressUnavailable,
  onRefresh,
  className,
}: {
  telemetry: TelemetrySnapshot | null;
  /** The run's `metadata.egress`, when the server said. */
  egress?: RunEgress | null;
  /** The newest navigate that was blocked with no computer to retry through. */
  egressUnavailable?: EgressUnavailable | null;
  onRefresh?: () => void;
  className?: string;
}) {
  if (!telemetry) {
    return (
      <div className={cn("flex flex-col gap-2 p-4", className)}>
        <EgressLine egress={egress} unavailable={egressUnavailable} />
        <p className="text-sm text-muted-foreground">
          Usage numbers load with the panel.
        </p>
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

      <EgressLine egress={egress} unavailable={egressUnavailable} />

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
