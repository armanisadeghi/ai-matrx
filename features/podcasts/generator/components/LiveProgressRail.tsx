"use client";

// features/podcasts/generator/components/LiveProgressRail.tsx
//
// The drumbeat. A status header (progress + LIVE dot + elapsed + the current
// step) over the full stage timeline. The featured "current step" is DERIVED
// from the stages that are actually running — so when work finishes out of
// order (audio is the long pole while images/videos land early) it always
// tracks the next live thing instead of sticking on the last one that started.

import { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  ChevronDown,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ElapsedTimer } from "./ElapsedTimer";
import type { PodcastRunState, StageRow } from "../types";

interface LiveProgressRailProps {
  state: PodcastRunState;
  startedAt: number | null;
}

/** Pick the label to feature in the header — always a live thing, never stuck. */
function featuredLabel(state: PodcastRunState): string {
  if (state.status === "done") return "Episode ready";
  if (state.status === "error") return "Finished with errors";
  const running = state.stages.filter((s) => s.status === "running");
  if (running.length > 0) {
    // Feature the earliest-position running stage (e.g. audio, the long pole),
    // so the header advances naturally as later stages finish around it.
    const earliest = running.reduce<StageRow>(
      (a, b) => (a.step <= b.step ? a : b),
      running[0],
    );
    if (running.length > 1) {
      return `${earliest.label} · +${running.length - 1} more`;
    }
    return earliest.label;
  }
  return state.currentLabel || "Starting up…";
}

export function LiveProgressRail({ state, startedAt }: LiveProgressRailProps) {
  const [open, setOpen] = useState(true);
  const running = state.status === "running";
  const doneCount = state.stages.filter((s) => s.status !== "running").length;
  const total = Math.max(state.totalSteps, state.stages.length);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Status header */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {running && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2.5 w-2.5 rounded-full",
                  state.status === "error"
                    ? "bg-destructive"
                    : state.status === "done"
                      ? "bg-emerald-500"
                      : "bg-primary",
                )}
              />
            </span>
            <span className="truncate text-sm font-medium text-foreground">
              {featuredLabel(state)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-muted-foreground">
            <ElapsedTimer startedAt={startedAt} running={running} />
            <span className="font-semibold text-foreground">
              {Math.round(state.progress)}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              state.status === "error"
                ? "bg-destructive"
                : "bg-gradient-to-r from-primary via-primary to-secondary",
            )}
            style={{ width: `${Math.min(100, Math.max(2, state.progress))}%` }}
          />
        </div>
      </div>

      {/* Stage timeline — all steps, scrolls only if it can't fit the viewport */}
      {state.stages.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground">
            <span>
              {doneCount} of {total} steps done
            </span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="max-h-[min(60vh,32rem)] space-y-0.5 overflow-y-auto border-t border-border p-2">
              {state.stages.map((stage) => (
                <li
                  key={stage.stage}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm"
                >
                  {stage.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : stage.status === "failed" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      stage.status === "running"
                        ? "font-medium text-foreground"
                        : stage.status === "failed"
                          ? "text-destructive/80"
                          : "text-muted-foreground",
                    )}
                  >
                    {stage.label}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
