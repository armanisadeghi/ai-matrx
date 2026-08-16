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
  WorkflowRunEmission,
  WorkflowRunState,
  WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import type { WorkflowRunStatus } from "@/features/workflow-runtime/types";

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

/** The run's workflow definition id (from attach options or the
 * subgraph_run_linked event for child runs), or null while unknown. */
export const selectRunDefinitionId = (runId: string) =>
  createSelector(
    [selectByRunId],
    (byRunId): string | null => byRunId[runId]?.definitionId ?? null,
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

export const selectAllAttachedRunIds = createSelector(
  [selectByRunId],
  (byRunId): string[] => {
    const ids = Object.keys(byRunId);
    return ids.length === 0 ? EMPTY_NODE_ORDER : ids;
  },
);
