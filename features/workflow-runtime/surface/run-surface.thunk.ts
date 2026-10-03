/**
 * loadRunSurface — the two reads a run's surface needs (run → workflow → its
 * authored surface), done ONCE per run and kept in the workflowRuns slice.
 *
 * THE REMOUNT LAW (Arman, 2026-10-02): a view of a run that wakes, remounts,
 * or opens beside another view of the same run reads nothing again and never
 * swaps itself for a skeleton. So the result lives in Redux keyed by run, a
 * read already in flight is shared, and a run already read answers at once.
 *
 * A failure is thrown as `RunRecordUnreadable`, which names the record (the
 * run or its workflow) the access gate should ask about.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";

import {
  runSurfaceLoaded,
  type RunSurfaceRecord,
} from "../redux/workflow-runs.slice";
import {
  fetchRunDefinitionId,
  fetchWorkflowDefinition,
  getDefaultSurface,
} from "./service";

/** Which record of a run could not be read — the access gate asks about that one. */
export class RunRecordUnreadable extends Error {
  constructor(
    readonly token: "workflow" | "workflow_run",
    readonly recordId: string,
    readonly readError?: unknown,
  ) {
    super(`The ${token === "workflow" ? "workflow" : "run"} could not be read.`);
    this.name = "RunRecordUnreadable";
  }
}

/** One in-flight read per run per store. */
const inFlightByStore = new WeakMap<
  AppDispatch,
  Map<string, Promise<RunSurfaceRecord>>
>();

async function readRunSurface(runId: string): Promise<RunSurfaceRecord> {
  const definitionId = await fetchRunDefinitionId(runId).catch(
    (error: unknown) => {
      throw new RunRecordUnreadable("workflow_run", runId, error);
    },
  );
  if (!definitionId) throw new RunRecordUnreadable("workflow_run", runId);
  const [workflow, surface] = await Promise.all([
    fetchWorkflowDefinition(definitionId).catch((error: unknown) => {
      throw new RunRecordUnreadable("workflow", definitionId, error);
    }),
    // No authored surface is not a broken workflow: the stage derives one.
    getDefaultSurface(definitionId, {
      audience: "consumer",
      profile: "full",
    }).catch(() => null),
  ]);
  if (!workflow) throw new RunRecordUnreadable("workflow", definitionId);
  return {
    definitionId: workflow.id,
    name: workflow.name,
    definition: workflow.definition,
    config: surface?.config ?? null,
  };
}

export const loadRunSurface =
  (runId: string) =>
  (dispatch: AppDispatch, getState: () => RootState): Promise<RunSurfaceRecord> => {
    const known = getState().workflowRuns.surfaceByRunId[runId];
    if (known) return Promise.resolve(known);
    let inFlight = inFlightByStore.get(dispatch);
    if (!inFlight) {
      inFlight = new Map();
      inFlightByStore.set(dispatch, inFlight);
    }
    const pending = inFlight.get(runId);
    if (pending) return pending;
    const reads = inFlight;
    const read = readRunSurface(runId)
      .then((surface) => {
        dispatch(runSurfaceLoaded({ runId, surface }));
        return surface;
      })
      .catch((thrown: unknown) => {
        throw thrown instanceof RunRecordUnreadable
          ? thrown
          : new RunRecordUnreadable("workflow_run", runId, thrown);
      })
      .finally(() => {
        reads.delete(runId);
      });
    reads.set(runId, read);
    return read;
  };
