/**
 * A LIVE ERRORED RUN SAYS WHY (lane HANDOVER, 2026-09-28).
 *
 * Cedar Ridge Physical Therapy ran "Add a referred patient: Rafael Moreno". The store refused the
 * patient's Insurance value before anything could be held, the engine emitted `run_errored` with
 * `error_type` and `error_message`, and the watching page said "stopped before it finished, and it
 * didn't record a reason" until a reload read the row. The reducer now keeps those facts as the
 * run's error, in the row's own shape, and the explanation names the step's real reason.
 */
import reducer, { applyRunEvent, attachRun } from "@/features/workflow-runtime/redux/workflow-runs.slice";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";
import { explainRunFailure } from "@/features/workflow-runtime/run-failure-explanation";

const RUN_ID = "35f0c3d0-2c2d-4a79-8edd-a5ce35fb4858";
const SAID =
  '1 record was NOT written: Insurance does not have a choice called "Blue Shield". Pick one of those, or add "Blue Shield" to the column\'s list of choices first.';

function errored(extra: Record<string, unknown>) {
  const state = reducer(reducer(undefined, { type: "@@INIT" }), attachRun({ runId: RUN_ID }));
  return reducer(
    state,
    applyRunEvent({
      runId: RUN_ID,
      event: {
        event: "run_errored",
        run_id: RUN_ID,
        ts: "2026-09-29T19:58:25Z",
        steps_executed: 1,
        node_id: "save_patient",
        step: 1,
        attempt: 1,
        ...extra,
      } as unknown as WorkflowRunEvent,
      seq: 7,
      replay: false,
    }),
  );
}

it("the store's sentence and the step's cause become the run's error", () => {
  const state = errored({ error_type: "invalid_input", error_message: SAID });
  const run = state.byRunId[RUN_ID]!;
  expect(run.error).toEqual({ message: SAID, error_type: "invalid_input", cause: "invalid_input", step_id: "save_patient" });
  const said = explainRunFailure(run.error, "Add a referred patient: Rafael Moreno");
  expect(said.headline).not.toMatch(/didn't record a reason/);
});

it("a class name is kept as the error type but is not taken for a cause", () => {
  const run = errored({ error_type: "ValueError", error_message: "boom" }).byRunId[RUN_ID]!;
  expect(run.error).toEqual({ message: "boom", error_type: "ValueError", step_id: "save_patient" });
});

it("an event with no message leaves the run's error alone", () => {
  expect(errored({ error_type: "invalid_input" }).byRunId[RUN_ID]!.error).toBeNull();
});
