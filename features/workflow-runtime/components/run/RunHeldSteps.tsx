"use client";

/**
 * RunHeldSteps — every step of a run whose change is HELD for a person, each
 * with the same approval card the chat and the table's page draw (lane
 * HELD-WRITE-TAILS, 2026-09-26).
 *
 * A held step reaches the run two ways, and both are drawn here:
 *   · `data.table.upsert` STOPS the run (its `saved_row` promises a row id that
 *     does not exist yet) — `RunFailureCard` mounts this under its "waiting for
 *     your approval" sentence;
 *   · `records.table_ensure` FINISHES with `held_for_approval` in its output —
 *     the run reads "Done", so `RunStage` mounts this on its own, where the run's
 *     cards sit, and a finished run never hides a decision nobody has taken.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { HeldStepCard } from "@/features/record-change-approvals/HeldStepCard";
import {
  heldWriteOfStep,
  type RecordChangeWait,
} from "@/features/record-change-approvals/recordChangeApproval";

import { selectRunState } from "../../redux/workflow-runs.selectors";

export function useRunHeldSteps(
  runId: string,
): { key: string; wait: RecordChangeWait; stopped: boolean }[] {
  const run = useAppSelector(selectRunState(runId));
  return Object.values(run?.nodes ?? {}).flatMap((invocation) => {
    const wait = heldWriteOfStep(invocation);
    return wait
      ? [{ key: invocation.invocationKey, wait, stopped: Boolean(invocation.error) }]
      : [];
  });
}

export function RunHeldSteps({
  runId,
  /** Only the steps that FINISHED holding (the stopped ones sit in the failure card). */
  finishedOnly = false,
  className,
}: {
  runId: string;
  finishedOnly?: boolean;
  className?: string;
}) {
  const held = useRunHeldSteps(runId).filter((step) => !finishedOnly || !step.stopped);
  if (held.length === 0) return null;
  return (
    <div className={className ?? "space-y-3"}>
      {held.map(({ key, wait, stopped }) => (
        <HeldStepCard key={key} wait={wait} identity={`${runId}:${key}`} stopped={stopped} />
      ))}
    </div>
  );
}
