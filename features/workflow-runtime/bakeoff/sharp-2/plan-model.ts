/**
 * plan-model — the sharp-2 bake-off's progressive-condensation model, pure.
 *
 * The plan column shows EVERY step of the definition from frame zero, but at
 * 40 steps a flat list buries the present. The model folds the list so
 * attention always sits on what's happening now and what's next:
 *
 *  - a stretch of finished steps (settled/skipped) of FOLD_MIN or more
 *    collapses into one "n steps done" seam;
 *  - upcoming idle steps beyond the next LOOKAHEAD collapse into one
 *    "n steps ahead" seam;
 *  - the focused step, any failed step, and any working/waiting step NEVER
 *    fold — problems and the present are always visible;
 *  - at SMALL_PLAN steps or fewer nothing folds at all, so a 4-step workflow
 *    reads as a simple checklist.
 *
 * Seams are expandable (the component holds which are open); the model only
 * decides what folds. Pure module — no React, no Redux.
 */

import type { NodeAggregatePhase } from "../../redux/workflow-runs.selectors";

export const SMALL_PLAN = 8;
export const FOLD_MIN = 3;
export const LOOKAHEAD = 3;

export type PlanRow =
  | { kind: "step"; nodeId: string }
  | { kind: "seam"; seamId: string; tone: "done" | "ahead"; nodeIds: string[] };

function foldable(
  phase: NodeAggregatePhase | undefined,
  tone: "done" | "ahead",
): boolean {
  if (tone === "done") return phase === "settled" || phase === "skipped";
  return phase === undefined || phase === "idle";
}

export function buildPlanRows(
  orderedNodeIds: string[],
  phases: Record<string, NodeAggregatePhase>,
  opts: {
    focusNodeId: string | null;
    /** seamIds the person opened — their members render as steps. */
    openSeams: ReadonlySet<string>;
  },
): PlanRow[] {
  if (orderedNodeIds.length <= SMALL_PLAN) {
    return orderedNodeIds.map((nodeId) => ({ kind: "step", nodeId }));
  }

  // The frontier: the last node that has left idle. Idle steps before it are
  // "waiting their turn" (kept individually — the engine may be about to run
  // them); idle steps after lookahead fold as "ahead".
  let frontier = -1;
  orderedNodeIds.forEach((nodeId, index) => {
    const phase = phases[nodeId];
    if (phase !== undefined && phase !== "idle") frontier = index;
  });

  const rows: PlanRow[] = [];
  let index = 0;
  while (index < orderedNodeIds.length) {
    const nodeId = orderedNodeIds[index];
    const tone: "done" | "ahead" | null =
      index <= frontier
        ? foldable(phases[nodeId], "done")
          ? "done"
          : null
        : index > frontier + LOOKAHEAD && foldable(phases[nodeId], "ahead")
          ? "ahead"
          : null;

    if (tone === null || nodeId === opts.focusNodeId) {
      rows.push({ kind: "step", nodeId });
      index++;
      continue;
    }

    // Extend the stretch of same-tone foldable steps (never across focus).
    const stretch: string[] = [];
    while (index < orderedNodeIds.length) {
      const candidate = orderedNodeIds[index];
      const inDone = index <= frontier && foldable(phases[candidate], "done");
      const inAhead =
        index > frontier + LOOKAHEAD && foldable(phases[candidate], "ahead");
      if (candidate === opts.focusNodeId) break;
      if ((tone === "done" && !inDone) || (tone === "ahead" && !inAhead)) break;
      stretch.push(candidate);
      index++;
    }

    const seamId = `${tone}:${stretch[0]}`;
    if (stretch.length < FOLD_MIN || opts.openSeams.has(seamId)) {
      for (const member of stretch) rows.push({ kind: "step", nodeId: member });
    } else {
      rows.push({ kind: "seam", seamId, tone, nodeIds: stretch });
    }
  }
  return rows;
}

/**
 * The step the focus window should follow: the freshest working step, else
 * the waiting frontier, else the last finished step, else the first step.
 */
export function freshestNodeId(
  orderedNodeIds: string[],
  phases: Record<string, NodeAggregatePhase>,
): string | null {
  if (orderedNodeIds.length === 0) return null;
  let lastWorking: string | null = null;
  let lastFailed: string | null = null;
  let lastSettled: string | null = null;
  for (const nodeId of orderedNodeIds) {
    const phase = phases[nodeId];
    if (phase === "running" || phase === "retrying" || phase === "waiting") {
      lastWorking = nodeId;
    } else if (phase === "failed") {
      lastFailed = nodeId;
    } else if (phase === "settled" || phase === "skipped") {
      lastSettled = nodeId;
    }
  }
  return lastWorking ?? lastFailed ?? lastSettled ?? orderedNodeIds[0];
}
