/**
 * plan-model — pure derivations for the refine-2 bake-off run page.
 *
 * The page's plan column shows EVERY step of the definition from frame zero,
 * and stays readable at 40 steps by progressive condensation: any contiguous
 * stretch of finished steps (length >= COLLAPSE_MIN) folds into one compact
 * "n steps done" row the reader can expand. Attention therefore always sits
 * on what is happening now and what is next.
 *
 * Pure module — no React, no Redux. Live phases are joined in by the caller.
 */

import type { NodeAggregatePhase } from "../../redux/workflow-runs.selectors";
import type { RunStepPresentation } from "../../components/run/node-presentation";

/** Fewer than this many consecutive done steps stay as individual rows. */
export const COLLAPSE_MIN = 3;

export interface PlanStepRow {
  kind: "step";
  step: RunStepPresentation;
  phase: NodeAggregatePhase;
  /** 1-based position in the definition, for the "Step 4 of 12" voice. */
  position: number;
}

export interface PlanFoldRow {
  kind: "fold";
  /** Stable key — the first folded step's node id. */
  key: string;
  steps: PlanStepRow[];
}

export type PlanRow = PlanStepRow | PlanFoldRow;

const DONE: ReadonlySet<NodeAggregatePhase> = new Set(["settled", "skipped"]);

/**
 * Fold contiguous finished stretches. Keys in `expanded` un-fold a stretch in
 * place (component state). A stretch shorter than COLLAPSE_MIN never folds, so
 * a 4-step workflow always reads as 4 plain rows.
 */
export function condensePlan(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
  expanded: ReadonlySet<string>,
): PlanRow[] {
  const stepRows: PlanStepRow[] = steps.map((step, index) => ({
    kind: "step",
    step,
    phase: phases[step.nodeId] ?? "idle",
    position: index + 1,
  }));

  const rows: PlanRow[] = [];
  let buffer: PlanStepRow[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const key = buffer[0].step.nodeId;
    if (buffer.length >= COLLAPSE_MIN && !expanded.has(key)) {
      rows.push({ kind: "fold", key, steps: buffer });
    } else {
      rows.push(...buffer);
    }
    buffer = [];
  };

  for (const row of stepRows) {
    if (DONE.has(row.phase)) {
      buffer.push(row);
    } else {
      flush();
      rows.push(row);
    }
  }
  flush();
  return rows;
}

/**
 * Where the camera should sit while it follows the run: the step working RIGHT
 * NOW (the last running one in definition order — the freshest work), else the
 * last step that has finished (a terminal run rests on its final work), else
 * the first step (nothing has happened yet).
 */
export function pickFollowTarget(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
): string | null {
  if (steps.length === 0) return null;
  let lastActive: string | null = null;
  let lastDone: string | null = null;
  for (const step of steps) {
    const phase = phases[step.nodeId] ?? "idle";
    if (phase === "running" || phase === "retrying" || phase === "waiting") {
      lastActive = step.nodeId;
    }
    if (phase === "settled" || phase === "failed") lastDone = step.nodeId;
  }
  return lastActive ?? lastDone ?? steps[0].nodeId;
}

/** Plain-language progress summary: "4 of 12 steps done". */
export function planSummary(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
): { done: number; total: number; working: number } {
  let done = 0;
  let working = 0;
  for (const step of steps) {
    const phase = phases[step.nodeId] ?? "idle";
    if (DONE.has(phase)) done += 1;
    if (phase === "running" || phase === "retrying") working += 1;
  }
  return { done, total: steps.length, working };
}
