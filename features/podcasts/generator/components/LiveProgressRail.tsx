"use client";

// features/podcasts/generator/components/LiveProgressRail.tsx
//
// The drumbeat. A status header (progress + LIVE dot + elapsed + the current
// step) over the full stage timeline. Each step shows a DOMAIN-SPECIFIC icon
// (web globe for research, film for video, waveform for audio, …) so finished
// steps don't collapse into one identical green check — and a running step
// shows its own icon, pulsing, so the loader "looks the part". The long
// prepare/research stage is expanded into synthetic sub-steps (see
// useStageDisplay) so the first minute never sits dead.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ElapsedTimer } from "./ElapsedTimer";
import { useStageDisplay } from "../useStageDisplay";
import { STAGE_KIND_ICON } from "../constants";
import type { PodcastRunState } from "../types";
import type { DisplayStage } from "../useStageDisplay";

interface LiveProgressRailProps {
  state: PodcastRunState;
  startedAt: number | null;
}

function StageIcon({ stage }: { stage: DisplayStage }) {
  const Icon = STAGE_KIND_ICON[stage.kind];
  return (
    <Icon
      className={cn(
        "h-4 w-4 shrink-0",
        stage.status === "done"
          ? "text-emerald-500"
          : stage.status === "failed"
            ? "text-destructive"
            : "animate-pulse text-primary",
      )}
    />
  );
}

export function LiveProgressRail({ state, startedAt }: LiveProgressRailProps) {
  const [open, setOpen] = useState(true);
  const { stages, doneCount, total, featuredLabel, progress } =
    useStageDisplay(state);
  const running = state.status === "running";

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

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              state.status === "error"
                ? "bg-destructive"
                : "bg-gradient-to-r from-primary via-primary to-secondary",
            )}
            style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
          />
        </div>
      </div>

      {/* Stage timeline — all steps, scrolls only past the viewport */}
      {stages.length > 0 && (
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
              {stages.map((stage) => (
                <li
                  key={stage.key}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm"
                >
                  <StageIcon stage={stage} />
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
