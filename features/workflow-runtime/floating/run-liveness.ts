/**
 * run-liveness — WHAT IS HAPPENING RIGHT NOW, as one line.
 *
 * The activity ring is the truth-feed: every phase transition, every tool
 * call, every progress sentence, oldest first. A full surface renders the
 * whole feed. A FLOATING run has room for exactly one line, so this module
 * picks it — and picking it is the only decision, because `activityLine`
 * already owns every word (`activity-copy.ts` is the one prose place).
 *
 * The pick: the newest LIVENESS entry (a phase / tool / progress marker —
 * `kind: "phase"` frames now carry the closed `AgentStepPhase` vocabulary),
 * falling back to the newest entry of any kind so a run that only reports
 * lifecycle events still says something. Null when the feed is empty, which
 * is a real state: the caller says "Starting…" rather than inventing motion.
 *
 * Pure module — no React, no Redux.
 */

import type { RunActivityEntry } from "../redux/workflow-runs.slice";
import {
  activityLine,
  type ActivityLine,
} from "../components/run/activity-copy";

/** The kinds that describe work IN FLIGHT, as opposed to lifecycle bookkeeping. */
const LIVENESS_KINDS = new Set(["phase", "tool", "progress"]);

/**
 * The single line for "what is it doing". `stepLabels` maps nodeId → the
 * definition's human step name; pass `{}` where the definition is not in
 * reach (the floating window renders at the root of the tree, outside the
 * workflow's own providers) and node ids humanise instead.
 */
export function currentLivenessLine(
  activity: readonly RunActivityEntry[],
  stepLabels: Record<string, string> = {},
): ActivityLine | null {
  if (activity.length === 0) return null;
  for (let i = activity.length - 1; i >= 0; i--) {
    const entry = activity[i];
    if (LIVENESS_KINDS.has(entry.kind)) return activityLine(entry, stepLabels);
  }
  return activityLine(activity[activity.length - 1], stepLabels);
}
