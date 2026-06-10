"use client";

// app/(core)/podcast/studio/run-a/_components/StageTimeline.tsx
//
// The full stage list. Each row uses the human label (never the machine stage
// key) and the per-kind StageLoader: animated while running, an accent icon on
// a TRANSPARENT background when done (the coloring fix), quiet red when failed.
// A connector line threads the rows so the pipeline reads as a sequence.

import { stageKind } from "@/features/podcasts/generator/constants";
import { cn } from "@/lib/utils";
import type { StageRow } from "@/features/podcasts/generator/types";
import { StageLoader } from "./StageLoader";

export function StageTimeline({ stages }: { stages: StageRow[] }) {
  return (
    <ol className="relative space-y-1">
      {stages.map((stage, i) => {
        const kind = stageKind(stage.stage);
        const running = stage.status === "running";
        const last = i === stages.length - 1;
        return (
          <li key={stage.stage} className="relative flex items-center gap-3">
            {/* connector */}
            {!last && (
              <span
                className="absolute left-[1.375rem] top-9 h-[calc(100%-1.25rem)] w-px bg-border"
                aria-hidden
              />
            )}
            <div
              className={cn(
                "flex flex-1 items-center gap-3 rounded-xl px-2 py-2 transition-colors",
                running && "bg-accent/40",
              )}
            >
              <StageLoader kind={kind} status={stage.status} />
              <span
                className={cn(
                  "min-w-0 flex-1 text-sm",
                  running
                    ? "font-semibold text-foreground"
                    : stage.status === "failed"
                      ? "text-destructive/80"
                      : "text-muted-foreground",
                )}
              >
                {stage.label}
              </span>
              {running && (
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-primary">
                  Working
                </span>
              )}
              {stage.status === "done" && (
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                  Done
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
