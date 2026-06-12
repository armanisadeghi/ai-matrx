"use client";

// app/(core)/podcast/studio/run-c/_components/BuildConsole.tsx
//
// The live stage timeline for run-c — modeled after a Vercel / CI deploy
// console: a vertical list of stages where the RUNNING one is visually
// promoted (bigger loader, accent rail, "Running" pill) and done/pending are
// quiet. Reuses the real useStageDisplay() (synthetic sub-steps + featured
// label) and the new per-kind StageLoader.

import { ElapsedTimer } from "@/features/podcasts/generator/components/ElapsedTimer";
import { useStageDisplay } from "@/features/podcasts/generator/useStageDisplay";
import type { PodcastRunState } from "@/features/podcasts/generator/types";
import { cn } from "@/lib/utils";
import { StageLoader, kindAccentText } from "./StageLoader";

export function BuildConsole({
  state,
  startedAt,
}: {
  state: PodcastRunState;
  startedAt: number | null;
}) {
  const { stages, doneCount, total, featuredLabel, progress } =
    useStageDisplay(state);
  const running = state.status === "running";
  const errored = state.status === "error";
  const dotColor = errored
    ? "bg-destructive"
    : state.status === "done"
      ? "bg-emerald-500"
      : "bg-primary";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header — featured stage, elapsed, progress bar */}
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {running && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              )}
              <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", dotColor)} />
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {featuredLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-muted-foreground">
            <ElapsedTimer startedAt={startedAt} running={running} />
            <span className="font-semibold text-foreground">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              errored ? "bg-destructive" : "bg-gradient-to-r from-primary via-primary to-secondary",
            )}
            style={{ width: `${Math.min(100, Math.max(3, progress))}%` }}
          />
        </div>
        <div className="text-[11px] font-medium text-muted-foreground">
          {doneCount} of {total} steps complete
        </div>
      </div>

      {/* Stage list */}
      <ul className="divide-y divide-border/60">
        {stages.map((stage) => {
          const isRunning = stage.status === "running";
          return (
            <li
              key={stage.key}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 transition-colors",
                isRunning && "bg-accent/30",
              )}
            >
              <StageLoader
                kind={stage.kind}
                status={stage.status}
                size={isRunning ? 38 : 32}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    isRunning
                      ? cn("font-semibold", kindAccentText(stage.kind))
                      : stage.status === "failed"
                        ? "text-destructive/80"
                        : stage.status === "done"
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                  )}
                >
                  {stage.label}
                </span>
                {isRunning && (
                  <span className="block text-[11px] text-muted-foreground">
                    Working…
                  </span>
                )}
              </span>
              {isRunning && (
                <span
                  className={cn(
                    "shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    kindAccentText(stage.kind),
                  )}
                >
                  Running
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
