/**
 * plan-view — pure joins between the workflow DEFINITION (what was promised)
 * and the live run state (what has happened). No React, no Redux.
 *
 * The bakeoff/refine surface reads the whole run state ONCE per render and
 * derives every per-step view through these helpers, instead of mounting one
 * selector per node (the selectors file's own guidance for whole-picture
 * surfaces).
 */

import type {
  NodeInvocationState,
  WorkflowRunState,
} from "../../redux/workflow-runs.slice";
import type { NodeAggregatePhase } from "../../redux/workflow-runs.selectors";
import type { RunStepPresentation } from "../../components/run/node-presentation";
import type { WorkflowDefinitionLike } from "../../trigger-points";

export interface StepView {
  step: RunStepPresentation;
  phase: NodeAggregatePhase;
  /** Every invocation of this step, insertion order (empty before it runs). */
  invocations: NodeInvocationState[];
  /** Fan-out denominator (1 for a plain step). */
  expectedCount: number;
  settledCount: number;
  /** Total wall time across settled invocations, when the engine reported it. */
  durationMs: number | null;
  /** The step's freshest live progress sentence, when one is running. */
  progressLine: string | null;
}

/** The aggregate-phase law — same rules the canonical selector applies. */
function aggregatePhase(
  invocations: NodeInvocationState[],
  expectedCount: number,
): NodeAggregatePhase {
  if (invocations.length === 0) return "idle";
  if (invocations.some((item) => item.phase === "running")) return "running";
  if (invocations.some((item) => item.phase === "retrying")) return "retrying";
  if (invocations.length < expectedCount) return "running";
  if (invocations.some((item) => item.phase === "failed")) return "failed";
  if (invocations.every((item) => item.phase === "skipped")) return "skipped";
  return "settled";
}

/** One StepView per definition step, joined onto the run (null run → all idle). */
export function buildStepViews(
  steps: RunStepPresentation[],
  run: WorkflowRunState | null,
): StepView[] {
  return steps.map((step) => {
    const aggregate = run?.nodeAggregates[step.nodeId];
    const invocations =
      aggregate && run
        ? aggregate.invocationKeys
            .map((key) => run.nodes[key])
            .filter((item): item is NodeInvocationState => item !== undefined)
        : [];
    const expectedCount = aggregate?.expectedCount ?? 0;
    const settled = invocations.filter(
      (item) => item.phase === "settled" || item.phase === "skipped",
    );
    const durations = settled
      .map((item) => item.durationMs)
      .filter((value): value is number => typeof value === "number");
    const running = invocations.find((item) => item.phase === "running");
    return {
      step,
      phase: aggregatePhase(invocations, expectedCount),
      invocations,
      expectedCount: Math.max(expectedCount, 1),
      settledCount: settled.length,
      durationMs:
        durations.length > 0
          ? durations.reduce((sum, value) => sum + value, 0)
          : null,
      progressLine: running?.progress?.message ?? null,
    };
  });
}

/** The step the reader should be watching: first running, else first failed,
 * else the first not-yet-settled step of a live run. Null when nothing is in
 * flight (not started / finished). */
export function spotlightStep(views: StepView[]): StepView | null {
  return (
    views.find((view) => view.phase === "running" || view.phase === "retrying") ??
    views.find((view) => view.phase === "failed") ??
    null
  );
}

/** Steps with no outgoing edge — the workflow's natural end points. Used as
 * the "final result" fallback for a workflow that declares no output_kind
 * anywhere, so even an undeclared workflow still names what it hands back. */
export function terminalStepIds(
  definition: WorkflowDefinitionLike,
): Set<string> {
  const sources = new Set(definition.edges.map((edge) => edge.source));
  const ids = new Set<string>();
  for (const node of definition.nodes) {
    if (!sources.has(node.id)) ids.add(node.id);
  }
  return ids;
}

/** "12s" · "1m 04s" · "1h 02m" — a step duration in the reader's units. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}
