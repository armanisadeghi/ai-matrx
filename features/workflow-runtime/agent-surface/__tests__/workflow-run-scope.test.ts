/**
 * The `matrx-user/workflow-run` read half, over a REAL reducer-built run: the
 * run row's input survives into `run_inputs`, the plan carries the page's own
 * retry / skip availability, and outputs are bounded.
 */

import reducer, {
  attachRun,
  seedRunRow,
  type WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import { selectNodeAggregatePhases, selectRunInput } from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import type { RunRow } from "@/features/workflow-runtime/types";
import type { RunStepPresentation } from "@/features/workflow-runtime/components/run/node-presentation";
import { buildWorkflowRunScope, excerptOf } from "../workflow-run-scope";

const RUN_ID = "run-scope-1";

const STEPS: RunStepPresentation[] = [
  { nodeId: "collect", label: "Collect", family: "input", iconName: null, outputKind: null, specType: null, collectsInput: true },
  { nodeId: "write", label: "Write it", family: "agent", iconName: null, outputKind: null, specType: null, collectsInput: false },
];

function seeded(row: Partial<RunRow>): WorkflowRunsState {
  const attached = reducer(reducer(undefined, { type: "@@INIT" }), attachRun({ runId: RUN_ID }));
  return reducer(
    attached,
    seedRunRow({
      runId: RUN_ID,
      row: {
        id: RUN_ID,
        definition_id: "def-1",
        status: "completed",
        input: null,
        output: null,
        error: null,
        created_at: "2026-09-28T00:00:00Z",
        completed_at: "2026-09-28T00:05:00Z",
        metadata: null,
        conversation_id: null,
        ...row,
      },
    }),
  );
}

describe("buildWorkflowRunScope", () => {
  it("carries the run row's input, the known status, and the page's own control rules", () => {
    const state = seeded({ input: { topic: "Heat pumps", notes: "x".repeat(2000) } });
    const root = { workflowRuns: state };
    expect(selectRunInput(RUN_ID)(root)).toEqual({ topic: "Heat pumps", notes: "x".repeat(2000) });

    const scope = buildWorkflowRunScope({
      runId: RUN_ID,
      run: state.byRunId[RUN_ID] ?? null,
      workflowId: "def-1",
      workflowName: "Research brief",
      steps: STEPS,
      phases: selectNodeAggregatePhases(RUN_ID)(root),
    });

    expect(scope.run_id).toBe(RUN_ID);
    expect(scope.run_status).toBe("completed");
    expect(scope.step_count).toBe(2);
    const inputs = scope.run_inputs as Record<string, unknown>;
    expect(inputs.topic).toBe("Heat pumps");
    // Bounded: a long input value is cut, and says so.
    expect(String(inputs.notes).length).toBeLessThan(700);
    expect(String(inputs.notes)).toContain("more characters");
    // A finished run offers no verb — every control is refused with a reason.
    const controls = scope.run_controls as Array<{ verb: string; enabled: boolean; reason: string | null }>;
    expect(controls.map((c) => c.verb)).toEqual(["pause", "resume", "stop", "cancel"]);
    expect(controls.every((c) => !c.enabled && !!c.reason)).toBe(true);
    const steps = scope.steps as Array<{ node_id: string; retry: { enabled: boolean } }>;
    expect(steps.map((s) => s.node_id)).toEqual(["collect", "write"]);
    expect(steps.every((s) => !s.retry.enabled)).toBe(true);
  });

  it("says nothing about the run's status before the server has", () => {
    const attached = reducer(reducer(undefined, { type: "@@INIT" }), attachRun({ runId: RUN_ID }));
    const scope = buildWorkflowRunScope({
      runId: RUN_ID,
      run: attached.byRunId[RUN_ID] ?? null,
      workflowId: "def-1",
      workflowName: "Research brief",
      steps: STEPS,
      phases: {},
    });
    expect(scope.run_status).toBeUndefined();
    expect(scope.run_inputs).toBeUndefined();
  });

  it("excerptOf bounds any value", () => {
    expect(excerptOf("short")).toBe("short");
    expect(excerptOf({ a: 1 })).toBe('{"a":1}');
    expect(excerptOf("y".repeat(50), 10)).toBe(`${"y".repeat(10)}… [40 more characters]`);
  });
});
