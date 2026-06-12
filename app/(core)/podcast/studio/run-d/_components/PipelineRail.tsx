"use client";

// app/(core)/podcast/studio/run-d/_components/PipelineRail.tsx
//
// The production pipeline — a vertical reactor of the four humanized phases.
// Reference: a CI/deploy timeline (Vercel build log) reimagined as a creative
// pipeline. Each phase is a node connected by a line that "flows" while active;
// done nodes lock in, the active node breathes, pending nodes sit dim. Substeps
// reveal under the active/done phases so the user sees real granular progress.

import { Check, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhaseView } from "./phases";

interface PipelineRailProps {
  phases: PhaseView[];
  /** Per-phase elapsed/duration text (e.g. "4.2s") keyed by phase id. */
  timings: Record<string, string>;
}

export function PipelineRail({ phases, timings }: PipelineRailProps) {
  return (
    <ol className="relative">
      {phases.map((p, i) => {
        const last = i === phases.length - 1;
        const active = p.status === "active";
        const done = p.status === "done";
        const failed = p.status === "failed";
        const Icon = p.def.icon;
        return (
          <li key={p.def.id} className="relative flex gap-4 pb-2">
            {/* Node + connector column */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors",
                  done && "border-success/40 bg-success/10 text-success",
                  active && "border-primary/50 bg-primary/10 text-primary",
                  failed &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                  !done &&
                    !active &&
                    !failed &&
                    "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                {active && (
                  <span className="sd-halo pointer-events-none absolute inset-0 rounded-2xl text-primary" />
                )}
                {done ? (
                  <Check className="h-5 w-5" />
                ) : active ? (
                  <Icon className="h-5 w-5" />
                ) : failed ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </span>
              {!last && (
                <span className="relative my-1 w-0.5 flex-1 overflow-hidden rounded-full bg-border">
                  {(done || active) && (
                    <span
                      className={cn(
                        "absolute inset-0",
                        done
                          ? "bg-success/50"
                          : "sd-connector-active text-primary",
                      )}
                    />
                  )}
                </span>
              )}
            </div>

            {/* Phase content */}
            <div className="flex-1 pb-5 pt-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      done || active || failed
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {p.def.label}
                  </span>
                  {active && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  )}
                </div>
                {timings[p.def.id] && (
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs",
                      done ? "text-muted-foreground" : "text-primary",
                    )}
                  >
                    {timings[p.def.id]}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {p.def.blurb}
              </p>

              {/* Substeps (only when there's progress to show) */}
              {p.steps.length > 0 && (active || done || failed) && (
                <ul className="mt-2.5 space-y-1.5">
                  {p.steps.map((s, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 text-xs"
                    >
                      <SubDot status={s.status} />
                      <span
                        className={cn(
                          s.status === "done"
                            ? "text-muted-foreground"
                            : s.status === "failed"
                              ? "text-destructive"
                              : "text-foreground",
                        )}
                      >
                        {s.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SubDot({ status }: { status: "running" | "done" | "failed" }) {
  if (status === "done")
    return <Check className="h-3 w-3 shrink-0 text-success" />;
  if (status === "failed")
    return <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />;
  return (
    <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      <span className="sd-halo absolute inset-0 rounded-full text-primary" />
    </span>
  );
}
