"use client";

/**
 * SharpStatusBand — the one fixed-height strip above the tracker panes.
 *
 * Everything a glance needs while a run is live: status, the engine's own
 * elapsed clock, cost, steps done, and the PROMISE — one chip per deliverable,
 * present from frame zero and ticking from "coming" to "ready". The band's
 * height never changes, so nothing below it ever shifts.
 */

import { Loader2, Pause, Play, Square } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { ElapsedTime } from "@/components/official-candidate/elapsed-time/ElapsedTime";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";

import { RunStatusChip } from "../../run-status";
import { TERMINAL_RUN_STATUSES } from "../../types";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import {
  selectNodeAggregatePhases,
  selectRunCostTotal,
  selectRunStartedAt,
  selectRunStatus,
  selectRunStatusTs,
} from "../../redux/workflow-runs.selectors";
import {
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import {
  deliverableChipState,
  settledStepCount,
  type DeliverableChipState,
} from "./sharp-model";

const CHIP_DOT: Record<DeliverableChipState, string> = {
  coming: "bg-muted-foreground/40",
  working: "bg-primary animate-pulse",
  ready: "bg-emerald-500",
  failed: "bg-destructive",
};

export function SharpStatusBand({
  runId,
  steps,
  deliverables,
  onOpenDeliverable,
}: {
  runId: string;
  steps: RunStepPresentation[];
  deliverables: RunStepPresentation[];
  onOpenDeliverable: (nodeId: string) => void;
}) {
  const status = useAppSelector(selectRunStatus(runId));
  const startedAt = useAppSelector(selectRunStartedAt(runId));
  const statusTs = useAppSelector(selectRunStatusTs(runId));
  const cost = useAppSelector(selectRunCostTotal(runId));
  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const { pause, resumePaused, cancel } = useWorkflowRunControls();

  const terminal = status !== null && TERMINAL_RUN_STATUSES.has(status);
  const running = status === "running";
  const paused = status === "paused";
  const done = settledStepCount(steps, phases);

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 overflow-hidden rounded-xl border border-border bg-card px-3">
      <RunStatusChip status={status ?? "pending"} />
      <span className="text-xs tabular-nums text-muted-foreground">
        <ElapsedTime
          startedAt={startedAt}
          running={!terminal && status !== null}
          endedAt={terminal ? statusTs : null}
        />
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {done}/{steps.length} steps
      </span>
      {cost > 0 ? (
        <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
          ${cost.toFixed(2)}
        </span>
      ) : null}

      {/* The promise — every deliverable, named before anything starts. */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {deliverables.map((step) => {
          const state = deliverableChipState(phases[step.nodeId]);
          return (
            <button
              key={step.nodeId}
              type="button"
              onClick={() => onOpenDeliverable(step.nodeId)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] transition-colors hover:border-primary/50",
                state === "ready"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
              title={
                state === "ready"
                  ? "Ready — open it"
                  : state === "working"
                    ? "Being made now"
                    : "Coming up"
              }
            >
              <span
                className={cn("h-1.5 w-1.5 rounded-full", CHIP_DOT[state])}
              />
              {humanizeKind(step.outputKind ?? step.label)}
            </button>
          );
        })}
      </div>

      {/* Lifecycle — quiet icon controls, gone once the run is over. */}
      {!terminal ? (
        <div className="flex shrink-0 items-center gap-1">
          {paused ? (
            <button
              type="button"
              onClick={() => void resumePaused(runId)}
              aria-label="Resume"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          ) : running ? (
            <button
              type="button"
              onClick={() => void pause(runId)}
              aria-label="Pause"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <button
            type="button"
            onClick={() => {
              void confirm({
                title: "Stop this run?",
                description:
                  "Steps already finished keep their results. The rest won't run.",
                confirmLabel: "Stop the run",
              }).then((ok) => {
                if (ok) void cancel(runId, "graceful");
              });
            }}
            aria-label="Stop the run"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
