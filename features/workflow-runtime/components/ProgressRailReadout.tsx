"use client";

/**
 * ProgressRailReadout — the podcast progress rail, generalized: one status
 * row per node fed ONLY by the workflowRuns selectors, plus authored
 * SYNTHETIC sub-steps (the podcast pattern, `features/podcasts/generator/
 * useStageDisplay.ts`): while a node with configured labels runs, its labels
 * advance one at a time on a randomized 2.2–5.5s cadence, the LAST one holds
 * until the node's aggregate phase leaves "running", then everything snaps
 * done instantly. A node that settles early snaps all done.
 *
 * Progress is presentation-local state — a refresh restarts the animation,
 * which is acceptable (the truth is the selectors, the cadence is theater).
 * The header bar caps at 99% until the run status is terminal (podcast law).
 *
 * Renders BARE — the readout frame (border/bg/title) is drawn by the host.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";

import {
  selectNodeAggregate,
  selectNodeAggregatePhases,
  selectRunNodeOrder,
  selectRunStatus,
} from "../redux/workflow-runs.selectors";
import { PhaseIcon, PHASE_LABEL } from "./readout-parts";

const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "errored",
]);

/** Randomized synthetic cadence — the podcast rail's proven feel. */
const SYNTH_STEP_MIN_MS = 2200;
const SYNTH_STEP_JITTER_MS = 3300;

function SyntheticSubSteps({
  labels,
  nodeRunning,
  nodeStarted,
}: {
  labels: string[];
  /** Aggregate phase is exactly "running". */
  nodeRunning: boolean;
  /** The node has left idle/waiting (running or already settled/failed…). */
  nodeStarted: boolean;
}) {
  const [doneCount, setDoneCount] = useState(0);

  // Advance one sub-step on a randomized timer chain (one chain per mounted
  // running node); HOLD the last sub-step until the real node settles. The
  // timeout cleanup on unmount/phase-change ends the chain.
  useEffect(() => {
    if (!nodeRunning) return undefined;
    if (doneCount >= labels.length - 1) return undefined;
    const id = setTimeout(
      () => setDoneCount((c) => c + 1),
      SYNTH_STEP_MIN_MS + Math.random() * SYNTH_STEP_JITTER_MS,
    );
    return () => clearTimeout(id);
  }, [nodeRunning, doneCount, labels.length]);

  if (!nodeStarted) return null;

  // Left "running" (settled/failed/skipped) → ALL done instantly, no lag.
  const synthDone = nodeRunning ? doneCount : labels.length;

  return (
    <div className="ml-6 space-y-0.5">
      {labels.map((label, i) => {
        if (i > synthDone) return null; // not revealed yet
        const done = i < synthDone;
        return (
          <div
            key={`${i}-${label}`}
            className="flex items-center gap-1.5 text-[11px]"
          >
            {done ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
            ) : (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
            )}
            <span
              className={done ? "text-muted-foreground" : "text-foreground"}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RailNodeRow({
  runId,
  nodeId,
  syntheticLabels,
}: {
  runId: string;
  nodeId: string;
  syntheticLabels?: string[];
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, nodeId));
  const { phase, invocations, specType, expectedCount, settledCount } = aggregate;
  const fanOut = expectedCount > 1 || invocations.length > 1;
  const nodeRunning = phase === "running";
  const nodeStarted = phase !== "idle" && phase !== "waiting";

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <PhaseIcon phase={phase} />
        <span className="truncate text-xs font-medium">
          {specType ?? "Workflow step"}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {fanOut
            ? `${settledCount}/${Math.max(expectedCount, invocations.length)} · `
            : ""}
          {PHASE_LABEL[phase] ?? phase}
        </span>
      </div>
      {syntheticLabels && syntheticLabels.length > 0 ? (
        <SyntheticSubSteps
          labels={syntheticLabels}
          nodeRunning={nodeRunning}
          nodeStarted={nodeStarted}
        />
      ) : null}
    </div>
  );
}

export function ProgressRailReadout({
  runId,
  nodeIds,
  syntheticSteps,
}: {
  runId: string;
  /** Nodes the rail narrates, in this order; absent = the run's node order. */
  nodeIds?: string[];
  /** Authored synthetic sub-step labels per nodeId. */
  syntheticSteps?: Record<string, string[]>;
}) {
  const runStatus = useAppSelector(selectRunStatus(runId));
  const runNodeOrder = useAppSelector(selectRunNodeOrder(runId));
  const phases = useAppSelector(selectNodeAggregatePhases(runId));

  const nodes = nodeIds && nodeIds.length > 0 ? nodeIds : runNodeOrder;
  const total = nodes.length;
  const settled = nodes.filter((nodeId) => {
    const phase = phases[nodeId];
    return phase === "settled" || phase === "skipped";
  }).length;

  const terminal = runStatus !== null && TERMINAL_RUN_STATUSES.has(runStatus);
  const rawPct = total > 0 ? Math.round((settled / total) * 100) : 0;
  // The podcast law: never show 100% while the run can still move.
  const pct = terminal ? rawPct : Math.min(99, rawPct);

  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            {settled}/{total} steps done
          </span>
          <span className="ml-auto tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {total === 0 ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CircleDashed className="h-3 w-3" />
          Waiting for the run to start
        </div>
      ) : (
        <div className="space-y-1">
          {nodes.map((nodeId) => (
            <RailNodeRow
              key={nodeId}
              runId={runId}
              nodeId={nodeId}
              syntheticLabels={syntheticSteps?.[nodeId]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
