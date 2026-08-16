/**
 * Pure derivation of pipeline-step STALENESS from artifact timestamps.
 *
 * THE PROBLEM THIS EXISTS FOR. The per-page pipeline's steps supersede
 * INDEPENDENTLY — each writes its own `plan.node_artifact` with its own `kind`
 * — so re-running the writer produces a newer draft that the old review never
 * saw. aidream resolves it correctly where it matters
 * (`services/content_plan/page_pipeline.py#approved_content` prefers RECENCY,
 * unit-tested), and that function's own docstring names the gap this module
 * closes: *"the rail would show both steps done and the build would render the
 * stale one."* Both steps green is the lie; the user has no reason to re-run
 * the review because nothing told them it was out of date.
 *
 * THE RULE: a step whose current artifact predates an upstream step's current
 * artifact is STALE — it was produced from an input that has since changed.
 *
 * STALE IS NOT FAILED. Nothing went wrong; the record is simply older than
 * what it was derived from. It is a state with a one-click fix (the re-run
 * button the rail already has), which is why this returns the reason in the
 * user's vocabulary rather than a boolean.
 *
 * DERIVED, NEVER STAMPED. This reads only the artifact rows the client already
 * fetched (`listNodeArtifacts`) — no server round-trip, and nothing here
 * writes to either table. aidream is the ONE writer of `plan.node_artifact`
 * and `plan.node_step`.
 */
import { PIPELINE_STEPS, type PlanNodeArtifactRow } from "../types";

export interface StepStaleness {
  /** The step whose newer artifact supersedes this one's input. */
  supersededBy: string;
  /** That step's human label, for copy that never says "p4_write". */
  supersededByLabel: string;
  /** When the upstream step last produced something. */
  upstreamAt: string;
  /** When this step last produced something. */
  currentAt: string;
}

const STEP_ORDER: readonly string[] = PIPELINE_STEPS.map(({ step }) => step);

const STEP_LABELS: ReadonlyMap<string, string> = new Map(
  PIPELINE_STEPS.map(({ step, label }) => [step, label]),
);

/**
 * A timestamp that cannot be parsed sorts as UNKNOWN and never makes anything
 * stale — inventing staleness from a malformed row would send the user to
 * re-run work that was fine.
 */
function timeOf(row: PlanNodeArtifactRow): number | null {
  const parsed = Date.parse(row.created_at);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The live artifact for a step — the one not superseded by a later revision. */
export function currentArtifactByStep(
  artifacts: readonly PlanNodeArtifactRow[],
): Map<string, PlanNodeArtifactRow> {
  const current = new Map<string, PlanNodeArtifactRow>();
  for (const row of artifacts) {
    if (row.valid_to !== null) continue;
    const held = current.get(row.step);
    // Defensive: if two rows are somehow both live, the newest one wins —
    // the same recency precedence the server applies.
    if (!held) {
      current.set(row.step, row);
      continue;
    }
    const heldAt = timeOf(held);
    const rowAt = timeOf(row);
    if (heldAt !== null && rowAt !== null && rowAt > heldAt) {
      current.set(row.step, row);
    }
  }
  return current;
}

/**
 * Which steps are stale, and what superseded each. Only steps that HAVE a
 * current artifact can be stale — a step that never ran is "not run", a
 * distinct state the rail already renders.
 *
 * When several upstream steps are newer, the NEWEST one is named: it is the
 * change the user most recently made, so it is the one that explains why this
 * step is behind.
 */
export function deriveStaleSteps(
  artifacts: readonly PlanNodeArtifactRow[] | undefined,
): Map<string, StepStaleness> {
  const stale = new Map<string, StepStaleness>();
  if (!artifacts || artifacts.length === 0) return stale;

  const current = currentArtifactByStep(artifacts);

  for (let index = 0; index < STEP_ORDER.length; index += 1) {
    const step = STEP_ORDER[index];
    const own = current.get(step);
    if (!own) continue;
    const ownAt = timeOf(own);
    if (ownAt === null) continue;

    let newest: { step: string; at: number } | null = null;
    for (let upstream = 0; upstream < index; upstream += 1) {
      const upstreamStep = STEP_ORDER[upstream];
      const upstreamRow = current.get(upstreamStep);
      if (!upstreamRow) continue;
      const upstreamAt = timeOf(upstreamRow);
      if (upstreamAt === null || upstreamAt <= ownAt) continue;
      if (!newest || upstreamAt > newest.at) {
        newest = { step: upstreamStep, at: upstreamAt };
      }
    }

    if (newest) {
      stale.set(step, {
        supersededBy: newest.step,
        supersededByLabel: STEP_LABELS.get(newest.step) ?? newest.step,
        upstreamAt: new Date(newest.at).toISOString(),
        currentAt: new Date(ownAt).toISOString(),
      });
    }
  }

  return stale;
}

/**
 * The sentence the rail shows. Written for someone who has never heard of
 * "p4_write" and does not need to: it says what changed, what that makes this
 * step, and what to do — the whole point of surfacing staleness at all.
 */
export function stalenessTitle(
  stepLabel: string,
  staleness: StepStaleness,
): string {
  return (
    `${stepLabel} is out of date — ${staleness.supersededByLabel} has run again since. ` +
    `Run it again to catch up.`
  );
}
