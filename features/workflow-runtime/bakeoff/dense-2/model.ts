/**
 * dense-2 bake-off — pure derivation shared by the desk's three panes.
 *
 * Joins the DEFINITION's step presentations (node-presentation.ts — known
 * before the first event) with the live run slice's aggregates into flat,
 * render-ready rows, and computes the plan ledger's progressive condensation
 * (contiguous finished stretches fold into one summary row so a 40-step plan
 * reads like a 6-step plan while it runs).
 *
 * Pure module — no React, no Redux.
 */

import type {
  NodeAggregatePhase,
} from "../../redux/workflow-runs.selectors";
import type {
  NodeInvocationState,
  WorkflowRunState,
} from "../../redux/workflow-runs.slice";
import type { RunStepPresentation } from "../../components/run/node-presentation";

export interface LedgerRow {
  step: RunStepPresentation;
  phase: NodeAggregatePhase;
  /** Longest invocation duration (fan-out runs in parallel), ms. Null until known. */
  durationMs: number | null;
  /** Fan-out progress: settled / expected. Both 0-ish for plain nodes. */
  settledCount: number;
  expectedCount: number;
  invocations: NodeInvocationState[];
}

/** One entry of the condensed plan: a live row, or a folded finished stretch. */
export type LedgerEntry =
  | { kind: "row"; row: LedgerRow }
  | {
      kind: "fold";
      /** Stable key — the first folded node's id. */
      key: string;
      rows: LedgerRow[];
      totalDurationMs: number | null;
    };

const DONE: ReadonlySet<string> = new Set(["settled", "skipped"]);

export function deriveLedgerRows(
  steps: RunStepPresentation[],
  run: WorkflowRunState | null,
): LedgerRow[] {
  return steps.map((step) => {
    const aggregate = run?.nodeAggregates[step.nodeId];
    const invocations = aggregate
      ? aggregate.invocationKeys
          .map((key) => run!.nodes[key])
          .filter((item): item is NodeInvocationState => item !== undefined)
      : [];
    let durationMs: number | null = null;
    for (const invocation of invocations) {
      if (invocation.durationMs !== null) {
        durationMs = Math.max(durationMs ?? 0, invocation.durationMs);
      }
    }
    const settledCount = invocations.filter((item) =>
      DONE.has(item.phase),
    ).length;
    return {
      step,
      phase: aggregatePhaseOf(invocations, aggregate?.expectedCount ?? 0),
      durationMs,
      settledCount,
      expectedCount: aggregate?.expectedCount ?? 0,
      invocations,
    };
  });
}

/** Mirror of the selectors' aggregate-phase law (kept tiny; the selectors'
 * version is per-node — this derivation already holds the invocations). */
function aggregatePhaseOf(
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

/** Fold contiguous finished stretches of ≥ MIN_FOLD plain (non-deliverable)
 * steps. Deliverable steps, the aimed step, and anything unfinished always
 * stay visible — attention lives with what's happening now and what's next. */
const MIN_FOLD = 3;

export function condensePlan(
  rows: LedgerRow[],
  aimedNodeId: string | null,
  expandedFolds: ReadonlySet<string>,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let buffer: LedgerRow[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    if (buffer.length >= MIN_FOLD && !expandedFolds.has(buffer[0].step.nodeId)) {
      let total: number | null = null;
      for (const row of buffer) {
        if (row.durationMs !== null) total = (total ?? 0) + row.durationMs;
      }
      entries.push({
        kind: "fold",
        key: buffer[0].step.nodeId,
        rows: buffer,
        totalDurationMs: total,
      });
    } else {
      for (const row of buffer) entries.push({ kind: "row", row });
    }
    buffer = [];
  };

  for (const row of rows) {
    const foldable =
      DONE.has(row.phase) &&
      row.step.outputKind === null &&
      row.step.nodeId !== aimedNodeId;
    if (foldable) {
      buffer.push(row);
    } else {
      flush();
      entries.push({ kind: "row", row });
    }
  }
  flush();
  return entries;
}

/** The freshest work — what the aimed focus follows: the LAST running step in
 * plan order; else the last failed one (the reader needs to see why); else,
 * once the run is over, the last deliverable that settled; else null. */
export function freshestNodeId(
  rows: LedgerRow[],
  runOver: boolean,
): string | null {
  let running: string | null = null;
  let failed: string | null = null;
  let lastDeliverable: string | null = null;
  for (const row of rows) {
    if (row.phase === "running" || row.phase === "retrying") {
      running = row.step.nodeId;
    }
    if (row.phase === "failed") failed = row.step.nodeId;
    if (row.step.outputKind !== null && row.phase === "settled") {
      lastDeliverable = row.step.nodeId;
    }
  }
  if (running) return running;
  if (failed) return failed;
  if (runOver && lastDeliverable) return lastDeliverable;
  return null;
}
