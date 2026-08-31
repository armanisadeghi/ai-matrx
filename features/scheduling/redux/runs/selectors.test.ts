import type { SchRunRow } from "../../types";
import {
  selectRunsForTask,
  type SchedulingRunsRootState,
} from "./selectors";

const RUN = {
  id: "run-1",
  task_id: "task-1",
} as SchRunRow;

function stateWithRun(): SchedulingRunsRootState {
  return {
    schedulingRuns: {
      byId: { [RUN.id]: RUN },
      byTaskId: {
        "task-1": { ids: [RUN.id], status: "success", error: null },
      },
    },
  };
}

describe("scheduling run selectors", () => {
  it("returns the same derived array for identical state and task", () => {
    const state = stateWithRun();
    expect(selectRunsForTask(state, "task-1")).toBe(
      selectRunsForTask(state, "task-1"),
    );
  });

  it("shares one stable empty result for an unloaded task", () => {
    const state = stateWithRun();
    expect(selectRunsForTask(state, "missing")).toBe(
      selectRunsForTask(state, "missing"),
    );
  });
});
