/**
 * THE REAL FRAMES, from the real run — wall W33's live check.
 *
 * Run ae724cc1-440a-4296-a631-fcac3c15ec34 of the Verification Desk
 * (definition aa3e6306-dc2a-485b-b656-3fff9b790b26) completed with
 * `ruling.verdict = "NOT REAL"`, and the Masterwork run box told the Expert
 * their finished verdict "returned result". TWO faults, both live:
 *
 *  1. THE WRONG STEP. The handover is the `output.to_frontend` node `pack`,
 *     at index 50 of a 57-node definition. Callers took the LAST array entry —
 *     `source_unchecked`, a mid-graph transform with two outgoing edges whose
 *     output really is `{result}`. A definition's `nodes` array is layout
 *     order; the EDGES are what say which step hands over.
 *  2. THE WRONG FIELD. `output.to_frontend` emits the restructured shape and
 *     returns its input unchanged, so `pack`'s stored output is
 *     `{verdict_pack}` and only its `node_emitted` payload carries `ruling`.
 *
 * ONE-LINE BUGS THIS CATCHES: `terminalStep` falling back to array position
 * when edges are present; `readPresentedResult` reading the stored output
 * before the presented payload.
 *
 * NOTHING HERE IS HAND-SHAPED. Both fixtures were captured from the live
 * database (workflow.definition / workflow.node_events) and are committed
 * verbatim — the full 57-node graph and the run's own terminal frames.
 */
import definitionFixture from "@/features/workflow-runtime/__tests__/fixtures/verification-desk-definition.json";
import terminalEvents from "@/features/workflow-runtime/__tests__/fixtures/verification-desk-terminal-events.json";

import workflowRunsReducer, {
  applyRunEvent,
  attachRun,
  type WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import { selectRunEmissions } from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import {
  describeWorkflowSteps,
  terminalStep,
} from "@/features/workflow-runtime/components/run/node-presentation";
import type { WorkflowDefinitionLike } from "@/features/workflow-runtime/trigger-points";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";
import { readPresentedResult } from "../presented-result";

const RUN_ID = "ae724cc1-440a-4296-a631-fcac3c15ec34";
const definition = definitionFixture as unknown as WorkflowDefinitionLike;
const events = terminalEvents as unknown as WorkflowRunEvent[];

const eventOf = (type: string, nodeId: string): WorkflowRunEvent => {
  const found = events.find(
    (event) =>
      (event as { event: string }).event === type &&
      (event as { node_id?: string }).node_id === nodeId,
  );
  if (!found) throw new Error(`fixture is missing ${type} for ${nodeId}`);
  return found;
};

/** The run's terminal frames, folded through the REAL reducer. */
function foldRun(): WorkflowRunsState {
  let state = workflowRunsReducer(undefined, attachRun({ runId: RUN_ID }));
  events.forEach((event, index) => {
    state = workflowRunsReducer(
      state,
      applyRunEvent({ runId: RUN_ID, event, seq: index + 1, replay: true }),
    );
  });
  return state;
}

it("names `pack` — the to_frontend sink — as the Verification Desk's handover step, not the last node in the array", () => {
  const steps = describeWorkflowSteps(definition).filter(
    (step) => !step.collectsInput,
  );
  // The forcing fact, straight from the captured graph: the array ENDS on a
  // node that is not a sink at all.
  expect(steps[steps.length - 1].nodeId).toBe("source_unchecked");
  expect(
    definition.edges.some((edge) => edge.source === "source_unchecked"),
  ).toBe(true);

  expect(terminalStep(steps, definition)?.nodeId).toBe("pack");
});

it("stops naming a to_frontend step the handover once the graph consumes it", () => {
  // THE EDGES, not the spec type, are what make a step the handover. Derived
  // from the captured graph by one stated change: feed `pack` into a step that
  // already exists, and it becomes a MID-RUN emit — the desk now ends on the
  // sink that consumed it. A resolver that just looks for `output.to_frontend`
  // still answers "pack" here, and is wrong.
  const consumed: WorkflowDefinitionLike = {
    nodes: definition.nodes,
    edges: [
      ...definition.edges,
      { id: "e-test-pack-onward", source: "pack", target: "source_unchecked" },
    ],
  };
  const steps = describeWorkflowSteps(consumed).filter(
    (step) => !step.collectsInput,
  );
  expect(terminalStep(steps, consumed)?.nodeId).not.toBe("pack");
});

it("reads the ruling the run PRESENTED, from the real node_emitted frame, when the handover step stored none", () => {
  // What the live frames actually carry — asserted, so a fixture that drifts
  // fails here instead of quietly weakening the test below.
  const emitted = eventOf("node_emitted", "pack") as unknown as {
    mode: string;
    payload: Record<string, unknown>;
  };
  expect(emitted.mode).toBe("restructured");
  expect(Object.keys(emitted.payload).sort()).toEqual([
    "ruling",
    "verdict_pack",
  ]);
  const stored = eventOf("node_completed", "pack") as unknown as {
    output: Record<string, unknown>;
  };
  expect(Object.keys(stored.output)).toEqual(["verdict_pack"]);

  const state = foldRun();
  const steps = describeWorkflowSteps(definition).filter(
    (step) => !step.collectsInput,
  );
  const handover = terminalStep(steps, definition);

  const result = readPresentedResult({
    nodeId: handover?.nodeId,
    emissions: selectRunEmissions(RUN_ID)({ workflowRuns: state }),
    output: stored.output,
  });

  expect(result?.key).toBe("ruling");
  expect(result?.source).toBe("emitted");
  // The Expert's own verdict, reachable only if the emitted payload was read.
  expect(result?.text.startsWith("NOT REAL\n\n")).toBe(true);
  expect(result?.text).toContain("media: NOT REAL; caption claim: unverified");
});

it("never mistakes a mid-graph transform's `{result}` for the run's result", () => {
  const midGraph = eventOf("node_completed", "source_unchecked") as unknown as {
    output: Record<string, unknown>;
  };
  expect(Object.keys(midGraph.output)).toEqual(["result"]);

  // Pointed at that step's output with NO emissions, there is nothing to
  // judge — `result` is not one of the three declared result keys.
  expect(
    readPresentedResult({
      nodeId: "source_unchecked",
      emissions: [],
      output: midGraph.output,
    }),
  ).toBeNull();
});
