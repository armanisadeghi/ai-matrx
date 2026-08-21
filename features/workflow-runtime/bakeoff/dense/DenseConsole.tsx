"use client";

/**
 * DenseConsole — the live run as an ops console.
 *
 * Fixed frame, four regions, ZERO page shift as state arrives:
 *
 *   ┌ header band (h-11): status · clock · cost · steps · transport · controls
 *   ├ promise strip (h-9): every deliverable, named from frame zero
 *   ├──────────┬──────────────────────────┬──────────────┐
 *   │ plan     │ magnifier (the working   │ activity log │
 *   │ ledger   │ step's internals, live)  │ (the truth)  │
 *   │          │ + deliverables board     │              │
 *   └──────────┴──────────────────────────┴──────────────┘
 *
 * Each region scrolls inside itself; the frame never moves. The magnifier
 * auto-follows the step that is working (pin any step to hold it), which is
 * how 40 steps stay readable: one step at full width, every other step one
 * ledger row. Lane promotion happens ONLY for the magnified step, so the
 * 12-lane budget survives any workflow size.
 */

import { useEffect, useState } from "react";
import { CircleGauge, OctagonX, Pause, Play, RadioTower } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import ElapsedTime from "@/components/official-candidate/elapsed-time/ElapsedTime";
import { cn } from "@/lib/utils";

import { useWorkflowRun } from "../../hooks/useWorkflowRun";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import {
  selectNodeAggregatePhases,
  selectRunActivity,
  selectRunCostTotal,
  selectRunStartedAt,
  selectRunStatus,
  selectRunStatusTs,
  selectRunTransportMode,
} from "../../redux/workflow-runs.selectors";
import { InterruptCard, RunErrorCard } from "../../components/readout-parts";
import { RunStatusChip } from "../../run-status";
import { TERMINAL_RUN_STATUSES } from "../../types";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import {
  deliverableSteps,
  describeWorkflowSteps,
  humanizeKind,
  stepsByNodeId,
} from "../../components/run/node-presentation";
import { ActivityLog } from "./ActivityLog";
import { DeliverablesBoard } from "./DeliverablesBoard";
import { PlanLedger } from "./PlanLedger";
import { StepInspector } from "./StepInspector";

export function DenseConsole({
  runId,
  definition,
  workflowName,
  onRunAgain,
}: {
  runId: string;
  definition: WorkflowDefinitionLike;
  workflowName: string;
  onRunAgain: () => void;
}) {
  const { ensureLane } = useWorkflowRun(runId);
  const { pause, resumePaused, cancel } = useWorkflowRunControls();

  const status = useAppSelector(selectRunStatus(runId));
  const statusTs = useAppSelector(selectRunStatusTs(runId));
  const startedAt = useAppSelector(selectRunStartedAt(runId));
  const cost = useAppSelector(selectRunCostTotal(runId));
  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const transport = useAppSelector(selectRunTransportMode(runId));
  const activity = useAppSelector(selectRunActivity(runId));

  const steps = describeWorkflowSteps(definition);
  const labels: Record<string, string> = {};
  for (const step of steps) labels[step.nodeId] = step.label;
  const byNode = stepsByNodeId(steps);
  const deliverables = deliverableSteps(steps);

  const over =
    status !== null &&
    (TERMINAL_RUN_STATUSES.has(status) || status === "errored");
  const doneCount = steps.filter(
    (s) => phases[s.nodeId] === "settled" || phases[s.nodeId] === "skipped",
  ).length;

  // ── Focus: follow the working step; pin to hold one ──────────────────────
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const workingStep = steps.find(
    (s) => phases[s.nodeId] === "running" || phases[s.nodeId] === "retrying",
  );
  const lastTouched = [...steps]
    .reverse()
    .find((s) => phases[s.nodeId] !== undefined && phases[s.nodeId] !== "idle");
  const focusStep =
    (pinnedNodeId ? byNode[pinnedNodeId] : undefined) ??
    workingStep ??
    lastTouched ??
    steps[0] ??
    null;

  // ── Quiet detector: an active run that has said nothing for a while ──────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (over) return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [over]);
  const lastHeardTs =
    activity.length > 0 ? activity[activity.length - 1].ts : startedAt;
  const quietMs = lastHeardTs ? now - Date.parse(lastHeardTs) : 0;
  const quiet = !over && status === "running" && quietMs > 25000;

  const stop = async () => {
    const ok = await confirm({
      title: "Stop this run?",
      description:
        "It will wrap up what it's doing and stop. Anything already finished stays yours.",
      confirmLabel: "Stop it",
      variant: "destructive",
    });
    if (ok) void cancel(runId, "graceful");
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Header band — fixed height, everything about the run at a glance ── */}
      <div className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-border/60 px-3 scrollbar-hide">
        <RunStatusChip status={status ?? "pending"} />
        <ElapsedTime
          startedAt={startedAt}
          running={!over}
          endedAt={over ? statusTs : null}
          className="text-xs font-medium tabular-nums text-foreground"
        />
        <span className="text-xs tabular-nums text-muted-foreground">
          {doneCount}/{steps.length} steps
        </span>
        {cost > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            ${cost.toFixed(2)}
          </span>
        ) : null}
        <span
          className={cn(
            "flex items-center gap-1 text-[11px]",
            transport === "sse"
              ? "text-emerald-600 dark:text-emerald-400"
              : transport === "polling"
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
          )}
        >
          <RadioTower className="h-3 w-3" />
          {transport === "sse"
            ? "Live"
            : transport === "polling"
              ? "Checking in"
              : over
                ? "Finished"
                : "Connecting"}
        </span>
        {quiet ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CircleGauge className="h-3 w-3" />
            Quiet for a moment — still working
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
          {workflowName}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {status === "running" ? (
            <HeaderAction
              icon={<Pause className="h-3 w-3" />}
              label="Pause"
              onClick={() => void pause(runId)}
            />
          ) : null}
          {status === "paused" ? (
            <HeaderAction
              icon={<Play className="h-3 w-3" />}
              label="Resume"
              onClick={() => void resumePaused(runId)}
            />
          ) : null}
          {!over && status !== null ? (
            <HeaderAction
              icon={<OctagonX className="h-3 w-3" />}
              label="Stop"
              destructive
              onClick={() => void stop()}
            />
          ) : null}
          {over ? (
            <HeaderAction
              icon={<Play className="h-3 w-3" />}
              label="Run again"
              onClick={onRunAgain}
            />
          ) : null}
        </div>
      </div>

      {/* ── Promise strip — every deliverable named from frame zero ── */}
      <div className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border/60 px-3 scrollbar-hide">
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          You&apos;ll get
        </span>
        {deliverables.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            Results appear in the middle panel as it works.
          </span>
        ) : (
          deliverables.map((step) => {
            const phase = phases[step.nodeId] ?? "idle";
            const ready = phase === "settled";
            const busy = phase === "running" || phase === "retrying";
            const bad = phase === "failed";
            return (
              <button
                key={step.nodeId}
                type="button"
                onClick={() => setPinnedNodeId(step.nodeId)}
                title={`From “${step.label}”`}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  ready &&
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  busy && "border-primary/30 bg-primary/10 text-primary",
                  bad &&
                    "border-destructive/30 bg-destructive/10 text-destructive",
                  !ready &&
                    !busy &&
                    !bad &&
                    "border-dashed border-border text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    ready
                      ? "bg-emerald-500"
                      : busy
                        ? "animate-pulse bg-primary"
                        : bad
                          ? "bg-destructive"
                          : "bg-muted-foreground/40",
                  )}
                />
                {step.outputKind ? humanizeKind(step.outputKind) : step.label}
              </button>
            );
          })
        )}
      </div>

      {/* ── The three columns ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:overflow-hidden">
        <PlanLedger
          runId={runId}
          steps={steps}
          selectedNodeId={focusStep?.nodeId ?? null}
          pinnedNodeId={pinnedNodeId}
          onSelect={(nodeId) => setPinnedNodeId(nodeId)}
          className="order-2 border-b border-border/60 lg:order-none lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r"
        />
        <div className="order-1 min-w-0 lg:order-none lg:h-full lg:min-h-0 lg:overflow-y-auto">
          <div className="space-y-3 p-3">
            <InterruptCard runId={runId} />
            <RunErrorCard runId={runId} nodeLabels={labels} />
            {focusStep ? (
              <StepInspector
                runId={runId}
                step={focusStep}
                pinned={pinnedNodeId !== null}
                onUnpin={() => setPinnedNodeId(null)}
                ensureLane={ensureLane}
              />
            ) : (
              <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
                This workflow has no steps to show.
              </div>
            )}
            <DeliverablesBoard
              runId={runId}
              deliverables={deliverables}
              labels={labels}
            />
          </div>
        </div>
        <ActivityLog
          activity={activity}
          stepLabels={labels}
          quiet={quiet}
          className="order-3 border-t border-border/60 lg:order-none lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0"
        />
      </div>
    </div>
  );
}

function HeaderAction({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors",
        destructive
          ? "border-destructive/30 text-destructive hover:bg-destructive/10"
          : "border-border text-foreground hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
