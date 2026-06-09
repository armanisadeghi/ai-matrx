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
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ElapsedTimer } from "./ElapsedTimer";
import { useStageDisplay } from "../useStageDisplay";
import { STAGE_KIND_ICON, STAGE_KIND_COLOR } from "../constants";
import type { PodcastRunState } from "../types";
import type { DisplayStage } from "../useStageDisplay";

interface LiveProgressRailProps {
  state: PodcastRunState;
  startedAt: number | null;
}

// A colorful, kind-specific status chip. RUNNING shows the step's own icon in
// its own color with a spinning ring around it (each kind is a different hue, so
// the timeline reads like a real production console — not a wall of green
// checks). DONE shows a small solid check in the kind's color; FAILED a red X.
function StageIcon({ stage }: { stage: DisplayStage }) {
  const Icon = STAGE_KIND_ICON[stage.kind];
  const color = STAGE_KIND_COLOR[stage.kind];

  if (stage.status === "running") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span
          className={cn(
            "absolute inset-0 animate-spin rounded-full border-2 border-t-transparent",
            color.ring,
          )}
        />
        <Icon className={cn("h-2.5 w-2.5", color.text)} />
      </span>
    );
  }

  if (stage.status === "failed") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/15">
        <X className="h-3 w-3 text-destructive" />
      </span>
    );
  }

  // done — kind-tinted chip with the kind icon (distinct per type), check on hover-less.
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
        color.bg,
      )}
    >
      <Icon className={cn("h-3 w-3", color.text)} />
    </span>
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
            <ul className="space-y-0.5 border-t border-border p-2">
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
