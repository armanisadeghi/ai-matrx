"use client";

/**
 * StageStepper — the pipeline's phase bar: every stage in order with live
 * counts; the active stage is the workspace filter. Desktop-first, scrolls
 * horizontally on narrow screens.
 */

import React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { PIPELINE_STAGES, STAGE_LABELS, type PipelineStage } from "../../pipeline-types";

export function StageStepper({
  active,
  counts,
  onSelect,
}: {
  active: PipelineStage;
  counts: Record<string, number>;
  onSelect: (stage: PipelineStage) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {PIPELINE_STAGES.map((stage, i) => {
        const count = counts[stage] ?? 0;
        const isActive = stage === active;
        return (
          <React.Fragment key={stage}>
            {i > 0 && (
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground/50"
                aria-hidden
              />
            )}
            <button
              type="button"
              onClick={() => onSelect(stage)}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              {STAGE_LABELS[stage]}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  isActive
                    ? "bg-primary-foreground/20"
                    : count > 0
                      ? "bg-muted text-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
