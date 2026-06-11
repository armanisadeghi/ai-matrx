"use client";

// app/(core)/podcast/studio/run-reimagine/[id]/_components/ControlRail.tsx
//
// The pipeline drumbeat for the Studio Stage — a slim "control-room" status
// strip. It reuses the REAL stage engine (useStageDisplay), which is the
// load-bearing piece of the original LiveProgressRail: synthetic sub-steps that
// keep the long prepare/research minute alive, honest done/total progress, and a
// domain-specific colored icon per stage kind. This re-presents that substance as
// a horizontal featured-step header over an expandable step list, instead of the
// original boxed card — preserving the behavior, changing only the frame.

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ElapsedTimer } from "@/features/podcasts/generator/components/ElapsedTimer";
import { useStageDisplay } from "@/features/podcasts/generator/useStageDisplay";
import {
  STAGE_KIND_ICON,
  STAGE_KIND_COLOR,
} from "@/features/podcasts/generator/constants";
import type { DisplayStage } from "@/features/podcasts/generator/useStageDisplay";
import type { PodcastRunState } from "@/features/podcasts/generator/types";

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

interface ControlRailProps {
  state: PodcastRunState;
  startedAt: number | null;
  streaming: boolean;
}

export function ControlRail({ state, startedAt, streaming }: ControlRailProps) {
  const [open, setOpen] = useState(false);
  const { stages, doneCount, total, featuredLabel, progress } =
    useStageDisplay(state);
  const running = state.status === "running";

  // Nothing has started yet and the run isn't live — no rail to show.
  if (stages.length === 0 && !running) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Featured-step header — the single "what's happening right now" line. */}
      <div className="flex items-center gap-3 px-4 py-3">
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
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {featuredLabel}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-muted-foreground">
          {(running || streaming) && (
            <ElapsedTimer startedAt={startedAt} running={running} />
          )}
          <span className="font-semibold text-foreground">
            {Math.round(progress)}%
          </span>
        </span>
      </div>

      {/* Honest progress bar */}
      <div className="px-4 pb-3">
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

      {/* Expandable full step list */}
      {stages.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground">
            <span>
              {doneCount} of {total} steps done
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                open && "rotate-180",
              )}
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
