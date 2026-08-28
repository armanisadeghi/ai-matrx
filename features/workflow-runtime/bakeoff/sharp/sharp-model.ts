/**
 * sharp-model — pure derivations for the "sharp" bake-off run surface.
 *
 * The surface is a delivery tracker: the plan spine on the left, one live
 * viewport in the middle, the activity ticker on the right. These helpers
 * decide, from definition order + live phases, which step the viewport
 * follows and how a deliverable chip reads — no React, no Redux.
 */

import type { NodeAggregatePhase } from "../../redux/workflow-runs.selectors";
import type { RunStepPresentation } from "../../components/run/node-presentation";

/**
 * The step the live viewport follows when the user hasn't pinned one:
 * the FIRST running step in definition order (the earliest thing happening
 * now), else the LAST step that has reported anything (the frontier), else
 * the first step of the plan.
 */
export function liveNodeId(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
): string | null {
  if (steps.length === 0) return null;
  const running = steps.find((step) => {
    const phase = phases[step.nodeId];
    return phase === "running" || phase === "retrying";
  });
  if (running) return running.nodeId;
  let frontier: string | null = null;
  for (const step of steps) {
    const phase = phases[step.nodeId] ?? "idle";
    if (phase !== "idle" && phase !== "waiting") frontier = step.nodeId;
  }
  return frontier ?? steps[0].nodeId;
}

/** Steps that have fully settled or been skipped — the "x of y" numerator. */
export function settledStepCount(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
): number {
  return steps.filter((step) => {
    const phase = phases[step.nodeId];
    return phase === "settled" || phase === "skipped";
  }).length;
}

export type DeliverableChipState = "coming" | "working" | "ready" | "failed";

export function deliverableChipState(
  phase: NodeAggregatePhase | undefined,
): DeliverableChipState {
  switch (phase) {
    case "running":
    case "retrying":
      return "working";
    case "settled":
      return "ready";
    case "failed":
      return "failed";
    default:
      return "coming";
  }
}

/*
 * `keepableDeliverables` used to live here: it EXCLUDED every
 * `output.to_frontend` node from the deliverables list because listing one
 * beside its own emission promised the same thing twice. That exclusion was a
 * workaround for a missing rule, and SPEC-workflow-ui-contract §3 is the rule
 * — dedupe key `(node_id, kind)`, widened so a deliverable that declares no
 * kind claims any emission from its own node, with the deliverable slot
 * winning inside `DeliveredStream`. The two cannot both survive: the exclusion
 * would hide the very node the dedupe exists to render exactly once. Deleted
 * at adoption (Volley 5), not deprecated.
 */
