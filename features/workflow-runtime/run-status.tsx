"use client";

// features/workflow-runtime/run-status.tsx
//
// THE one place a `workflow.run.status` becomes words and an icon.
//
// There were two copies before this file: `RUN_STATUS_LABEL` inside
// ReadoutView.tsx and a second `STATUS_LABEL` inside the old
// catalog/WorkflowCatalog.tsx — and they disagreed on the same enum
// ("completed" was "Done" in one and "Finished" in the other, "cancelled" was
// "Stopped" in one and shared its label with "failed" in the other). A user
// moving between a run surface and the workflow list saw one run described two
// ways. The list page would have been a third copy; instead both collapse here.
//
// Labels are the run-surface vocabulary (the more complete of the two: all ten
// statuses, plus the mapping onto the node-phase icons that PhaseIcon already
// draws). Plain language for a non-technical reader — never the raw enum.

import { cn } from "@/lib/utils";
import { PhaseIcon } from "./components/readout-parts";

/**
 * Run status → the node-phase vocabulary `PhaseIcon` / `PHASE_LABEL` are keyed
 * on. Without this mapping a completed run drew the idle circle.
 */
export const RUN_STATUS_PHASE: Record<string, string> = {
  pending: "idle",
  running: "running",
  cancelling: "running",
  pausing: "running",
  paused: "waiting",
  interrupted: "waiting",
  errored: "failed",
  completed: "settled",
  failed: "failed",
  cancelled: "skipped",
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  pending: "Not started",
  running: "Working",
  cancelling: "Stopping",
  pausing: "Pausing",
  paused: "Paused",
  interrupted: "Waiting for input",
  errored: "Needs attention",
  completed: "Done",
  failed: "Needs attention",
  cancelled: "Stopped",
};

/** The words for one status, falling back to the raw value rather than "". */
export function runStatusLabel(status: string | null | undefined): string {
  if (!status) return "Never run";
  return RUN_STATUS_LABEL[status] ?? status;
}

/**
 * The compact status pill used wherever a run is REFERRED to rather than
 * watched — list rows, cards, summaries. Icon comes from `PhaseIcon` so the
 * pill and the live surface can never draw a run two different ways.
 */
export function RunStatusChip({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const phase = status ? (RUN_STATUS_PHASE[status] ?? "idle") : "idle";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[11px] font-medium",
        phase === "settled" && "bg-primary/10 text-primary",
        phase === "failed" && "bg-destructive/10 text-destructive",
        phase === "running" && "bg-primary/10 text-primary",
        phase === "waiting" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        (phase === "idle" || phase === "skipped") && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <PhaseIcon phase={phase} />
      <span className="truncate">{runStatusLabel(status)}</span>
    </span>
  );
}
