/**
 * Workflow Runs selectors — all memoized (createSelector), per-property,
 * parameterized as FACTORY functions: call `selectRunStatus(runId)` once
 * (e.g. inside a component with the React Compiler holding it stable, or
 * module-level for a fixed id) and pass the returned selector to
 * useAppSelector. Absent rows resolve to stable EMPTY constants — never a
 * fresh [] / {} per call.
 *
 * Aggregate node phase is DERIVED here, never stored: a node with fan-out is
 * settled only when every expected invocation has settled
 * (`invocations.length >= expectedCount`) — `node_id` alone is never a
 * completion key (see workflow-runs.slice.ts, THE INVOCATION LAW).
 */

import { createSelector } from "@reduxjs/toolkit";
import type {
  NodeInvocationState,
  NodeRunPhase,
  RunActivityEntry,
  WorkflowRunEmission,
  WorkflowRunState,
  WorkflowRunsState,
  WorkflowRunWorkSet,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import {
  readSettledDecision,
  type SettledDecision,
} from "@/features/workflow-runtime/interrupt/interrupt-view";
import type {
  RunRecordSignal,
  WorkflowRunStatus,
} from "@/features/workflow-runtime/types";

interface StateWithWorkflowRuns {
  workflowRuns: WorkflowRunsState;
}

const selectByRunId = (state: StateWithWorkflowRuns) =>
  state.workflowRuns.byRunId;

/** Stable empties — selectors for absent rows must not mint fresh values. */
const EMPTY_NODE_ORDER: string[] = [];
const EMPTY_EMISSIONS: WorkflowRunEmission[] = [];
const EMPTY_CHILD_RUN_IDS: string[] = [];
const EMPTY_INVOCATIONS: NodeInvocationState[] = [];

export type NodeAggregatePhase = "idle" | "waiting" | NodeRunPhase;

export interface NodeAggregateView {
  nodeId: string;
  specType: string | null;
  phase: NodeAggregatePhase;
  invocations: NodeInvocationState[];
  expectedCount: number;
  settledCount: number;
}

/** The aggregate-phase law, ported from the studio's
 * aggregateInvocationState: any running → running; else any failed → failed;
 * else all settled/skipped AND count >= expected → settled (skipped when ALL
 * skipped); else retrying if any; else running while partial; empty → idle. */
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

export const selectRunState = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): WorkflowRunState | null => byRunId[runId] ?? null,
  );

export const selectRunStatus = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): WorkflowRunStatus | null => byRunId[runId]?.status ?? null,
  );

export const selectRunError = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): Record<string, unknown> | null => byRunId[runId]?.error ?? null,
  );

/**
 * The run's `run_result` runtime wrapper, payload already rehydrated at the
 * ingest gate. Null until the run read lands (and for pre-wrapper runs).
 */
export const selectRunResult = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): WorkflowRunState["result"] => byRunId[runId]?.result ?? null,
  );

export const selectRunInterrupt = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): WorkflowRunState["interrupt"] =>
      byRunId[runId]?.interrupt ?? null,
  );

export const selectRunNodeOrder = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): string[] => byRunId[runId]?.nodeOrder ?? EMPTY_NODE_ORDER,
  );

export const selectNodeAggregate = (runId: string, nodeId: string) =>
  createSelector([selectByRunId], (byRunId): NodeAggregateView => {
    const run = byRunId[runId];
    const aggregate = run?.nodeAggregates[nodeId];
    if (!run || !aggregate) {
      return {
        nodeId,
        specType: null,
        phase: "idle",
        invocations: EMPTY_INVOCATIONS,
        expectedCount: 0,
        settledCount: 0,
      };
    }
    const invocations = aggregate.invocationKeys
      .map((key) => run.nodes[key])
      .filter((item): item is NodeInvocationState => item !== undefined);
    const settledCount = invocations.filter(
      (item) => item.phase === "settled" || item.phase === "skipped",
    ).length;
    return {
      nodeId,
      specType: aggregate.specType,
      phase: aggregatePhase(invocations, aggregate.expectedCount),
      invocations,
      expectedCount: aggregate.expectedCount,
      settledCount,
    };
  });

export const selectNodeInvocation = (runId: string, invocationKey: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): NodeInvocationState | null =>
      byRunId[runId]?.nodes[invocationKey] ?? null,
  );

export const selectRunCostTotal = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): number => byRunId[runId]?.costTotalUsd ?? 0,
  );

export const selectRunEmissions = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): WorkflowRunEmission[] =>
      byRunId[runId]?.emissions ?? EMPTY_EMISSIONS,
  );

const EMPTY_PHASES: Record<string, NodeAggregatePhase> = {};

/** Aggregate phase for EVERY node of a run in one map — what surfaces that
 * need the whole picture (trigger resolution, progress rails) read instead of
 * mounting one selector per node. */
export const selectNodeAggregatePhases = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): Record<string, NodeAggregatePhase> => {
      const run = byRunId[runId];
      if (!run || run.nodeOrder.length === 0) return EMPTY_PHASES;
      const phases: Record<string, NodeAggregatePhase> = {};
      for (const nodeId of run.nodeOrder) {
        const aggregate = run.nodeAggregates[nodeId];
        if (!aggregate) continue;
        const invocations = aggregate.invocationKeys
          .map((key) => run.nodes[key])
          .filter((item): item is NodeInvocationState => item !== undefined);
        phases[nodeId] = aggregatePhase(invocations, aggregate.expectedCount);
      }
      return phases;
    },
  );

/** The child run a workflow/orchestra node linked (subgraph_run_linked), or
 * null while the node hasn't run yet. */
export const selectChildRunIdForNode = (runId: string, nodeId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): string | null =>
      byRunId[runId]?.childRunsByNode[nodeId] ?? null,
  );

export const selectChildRunIds = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): string[] => byRunId[runId]?.childRunIds ?? EMPTY_CHILD_RUN_IDS,
  );

const EMPTY_SIGNALS: RunRecordSignal[] = [];

const EMPTY_STICKY: WorkflowRunState["sticky"] = {
  pausedOnce: false,
  interruptedOnce: false,
  startedNodes: {},
  completedNodes: {},
  failedNodes: {},
};

/** Sticky (monotonic) trigger facts — see the slice's `sticky` contract. */
export const selectRunStickyFacts = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): WorkflowRunState["sticky"] =>
      byRunId[runId]?.sticky ?? EMPTY_STICKY,
  );

/** The bounded signal ring (Phase 3 pump) — newest last. */
export const selectRunSignals = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): RunRecordSignal[] => byRunId[runId]?.signals ?? EMPTY_SIGNALS,
  );

/** Coarse pump revision — bumps on EVERY signal. Subscribe + refetch on
 * change (the pump itself never refetches). */
export const selectRunSignalRevision = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): number => byRunId[runId]?.signalRevision ?? 0,
  );

/** Targeted pump revision — bumps only for record_update signals naming this
 * matrx-orm table. */
export const selectRunSignalRevisionForTable = (runId: string, table: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): number => byRunId[runId]?.signalRevisionByTable[table] ?? 0,
  );

/** The run's workflow definition id (from attach options or the
 * subgraph_run_linked event for child runs), or null while unknown. */
export const selectRunDefinitionId = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): string | null => byRunId[runId]?.definitionId ?? null,
  );

const EMPTY_ACTIVITY: RunActivityEntry[] = [];

/** THE ACTIVITY TRUTH-FEED, oldest first (bounded ring — see ACTIVITY_MAX). */
export const selectRunActivity = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): RunActivityEntry[] => byRunId[runId]?.activity ?? EMPTY_ACTIVITY,
  );

/** When the ENGINE started this run (ISO), not when this client attached. */
export const selectRunStartedAt = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): string | null => byRunId[runId]?.startedAtTs ?? null,
  );

/** The ts of the last status transition — the run's end once it is terminal. */
export const selectRunStatusTs = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): string | null => byRunId[runId]?.statusTs ?? null,
  );

export const selectRunTransportMode = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): "sse" | "polling" | "idle" =>
      byRunId[runId]?.transportMode ?? "idle",
  );

export const selectLaneRequestId = (runId: string, invocationKey: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): string | null =>
      byRunId[runId]?.nodes[invocationKey]?.laneRequestId ?? null,
  );

export const selectRunStepsExecuted = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): number => byRunId[runId]?.stepsExecuted ?? 0,
  );

// ---------------------------------------------------------------------------
// SPEC §4.2 — settled decisions, so provenance is ALWAYS on screen
// ---------------------------------------------------------------------------

const EMPTY_DECISIONS: SettledDecision[] = [];

/** The node spec whose settled output IS a decision record. */
const HUMAN_INPUT_SPEC = "control.human_input";

/**
 * Every `control.human_input` step of this run that has SETTLED, with who
 * decided read off `matrx_decision`.
 *
 * The live interrupt card disappears the instant the run resumes — which is
 * exactly when the answer becomes a record somebody may need to audit. §4.2:
 * "every surface showing an approval MUST show 'Approved by <person>' or
 * 'Auto-approved by <agent> after the deadline'." This is what makes that
 * possible without replaying the run's events.
 */
export const selectRunDecisions = (runId: string) =>
  createSelector([selectByRunId], (byRunId): SettledDecision[] => {
    const run = byRunId[runId];
    if (!run) return EMPTY_DECISIONS;
    const decisions: SettledDecision[] = [];
    for (const nodeId of run.nodeOrder) {
      const aggregate = run.nodeAggregates[nodeId];
      if (!aggregate || aggregate.specType !== HUMAN_INPUT_SPEC) continue;
      for (const key of aggregate.invocationKeys) {
        const invocation = run.nodes[key];
        // BOTH terminal phases carry a decision. Proven live on run
        // 6ffdc118: the engine settles a RESUMED `control.human_input` as
        // `node_skipped` (the node did not execute — its output IS the
        // person's answer), so reading only `settled` found nothing, ever.
        if (
          !invocation ||
          (invocation.phase !== "settled" && invocation.phase !== "skipped")
        ) {
          continue;
        }
        const decision = readSettledDecision(nodeId, invocation.output);
        if (decision) decisions.push(decision);
      }
    }
    return decisions.length > 0 ? decisions : EMPTY_DECISIONS;
  });

// ---------------------------------------------------------------------------
// SPEC §5 — work sets, folded since the emitter shipped and never rendered
// ---------------------------------------------------------------------------

/** One node's work set, or null when that node runs no queue. */
export const selectNodeWorkSet = (runId: string, nodeId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): WorkflowRunWorkSet | null =>
      byRunId[runId]?.workSets[nodeId] ?? null,
  );

// ---------------------------------------------------------------------------
// SPEC §5.2 — the sibling lanes of a fanned-out node
// ---------------------------------------------------------------------------

/**
 * The sibling invocations of ONE node, ordered by `item_index`, or the stable
 * empty when the node never fanned out.
 *
 * A single-invocation node deliberately returns EMPTY: a "lane" for a step
 * that ran once IS the step, and drawing it twice is the duplication the
 * canonical component law exists to prevent.
 */
export const selectNodeSiblingLanes = (runId: string, nodeId: string) =>
  createSelector([selectByRunId], (byRunId): NodeInvocationState[] => {
    const run = byRunId[runId];
    const aggregate = run?.nodeAggregates[nodeId];
    if (!run || !aggregate || aggregate.invocationKeys.length < 2) {
      return EMPTY_INVOCATIONS;
    }
    const lanes = aggregate.invocationKeys
      .map((key) => run.nodes[key])
      .filter((item): item is NodeInvocationState => item !== undefined);
    return lanes.length < 2
      ? EMPTY_INVOCATIONS
      : [...lanes].sort((a, b) => a.itemIndex - b.itemIndex);
  });

export const selectAllAttachedRunIds = createSelector(
  [selectByRunId],
  (byRunId): string[] => {
    const ids = Object.keys(byRunId);
    return ids.length === 0 ? EMPTY_NODE_ORDER : ids;
  },
);
