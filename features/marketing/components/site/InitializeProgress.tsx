"use client";

import {
  Check,
  Circle,
  CircleMinus,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { INITIALIZE_STEP_NAMES } from "@/features/marketing/crawler/direct-client";
import {
  INITIALIZE_STEP_LABELS,
  type InitializeStepsState,
} from "@/features/marketing/components/site/initialize-progress";
import { cn } from "@/lib/utils";

/**
 * Live step strip for the initialize run: the four concurrent steps with
 * per-step state. When the deployed scraper predates the granular
 * `initialize_step` events (`indeterminate`), the strip stays honest — an
 * overall spinner with all steps neutral instead of fake per-step progress.
 */
export function InitializeProgress({
  steps,
  running,
  indeterminate,
}: {
  steps: InitializeStepsState;
  running: boolean;
  indeterminate: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {INITIALIZE_STEP_NAMES.map((step) => {
        const state = steps[step];
        const showIndeterminate = indeterminate && running;
        return (
          <span
            key={step}
            className="inline-flex items-center gap-1.5 text-xs"
            title={
              state.status === "failed" || state.status === "skipped"
                ? (state.message ?? "")
                : undefined
            }
          >
            {showIndeterminate || state.status === "pending" ? (
              <Circle className="h-3 w-3 text-muted-foreground/40" />
            ) : state.status === "running" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : state.status === "done" ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : state.status === "skipped" ? (
              <CircleMinus className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
            )}
            <span
              className={cn(
                state.status === "failed"
                  ? "text-destructive"
                  : state.status === "done"
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {INITIALIZE_STEP_LABELS[step]}
              {state.status === "done" && state.count !== null
                ? ` (${state.count.toLocaleString()})`
                : ""}
            </span>
          </span>
        );
      })}
      {indeterminate && running ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Working…
        </span>
      ) : null}
    </div>
  );
}
