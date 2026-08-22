/**
 * A WORKFLOW THE PLATFORM BUILT FOR ITSELF MUST STILL HAVE A RUN PAGE.
 *
 * `data.spec_type` / `data.category` are written by the Studio builder and by
 * nothing else. Every definition the platform creates programmatically —
 * compiled Orchestra plans, agent-authored plans, anything POSTed to
 * `/workflows` — carries `type` on the node and NULL for both (verified
 * against live rows 2026-08-22: `Agent plan: Orchestra sequential`,
 * `[engram-verify] throwaway lifecycle probe`).
 *
 * Reading only `data` classified every one of those steps as plumbing, so the
 * run stage derived ZERO readouts: an agent could run, cost real money and
 * finish, and the page showed an empty column the whole time. No amount of
 * streaming reaches a surface that has nowhere to put it.
 */

import { deriveDefaultSurfaceConfig } from "../surface/config";
import { describeWorkflowSteps, deliverableSteps } from "../components/run/node-presentation";

/** The exact shape a compiled Orchestra plan writes. */
const PROGRAMMATIC = {
  nodes: [
    { id: "step_1_args", type: "data.transform", data: {} },
    { id: "step_1", type: "ai.agent.start", data: { input: { agent_id: "a" } } },
    { id: "step_2", type: "ai.agent.produce", data: { output_kind: "quiz_set" } },
  ],
  edges: [],
};

/** The same graph as the Studio writes it. */
const AUTHORED = {
  nodes: [
    { id: "step_1_args", type: "data.transform", data: { spec_type: "data.transform", category: "data" } },
    { id: "step_1", type: "ai.agent.start", data: { spec_type: "ai.agent.start", category: "agent" } },
    { id: "step_2", type: "ai.agent.produce", data: { spec_type: "ai.agent.produce", category: "agent", output_kind: "quiz_set" } },
  ],
  edges: [],
};

describe("a programmatically-created definition renders like an authored one", () => {
  it("derives a readout for its agent steps", () => {
    const readouts = deriveDefaultSurfaceConfig(PROGRAMMATIC).readouts;
    const nodeIds = readouts.map((r) =>
      r.source.kind === "node" ? r.source.nodeId : null,
    );
    expect(nodeIds).toContain("step_1");
    expect(nodeIds).toContain("step_2");
    // Plumbing is still narrated by the rail, never given a box.
    expect(nodeIds).not.toContain("step_1_args");
  });

  it("derives the SAME readouts an authored definition does", () => {
    expect(deriveDefaultSurfaceConfig(PROGRAMMATIC)).toEqual(
      deriveDefaultSurfaceConfig(AUTHORED),
    );
  });

  it("classifies its steps into the same families", () => {
    const families = (d: typeof PROGRAMMATIC) =>
      describeWorkflowSteps(d).map((s) => `${s.nodeId}:${s.family}`);
    expect(families(PROGRAMMATIC)).toEqual(families(AUTHORED));
    expect(families(PROGRAMMATIC)).toContain("step_1:agent");
  });

  it("still promises its deliverables from the first frame", () => {
    expect(deliverableSteps(describeWorkflowSteps(PROGRAMMATIC)).map((s) => s.nodeId)).toEqual([
      "step_2",
    ]);
  });

  it("leaves an unknown node type exactly as it was", () => {
    const exotic = { nodes: [{ id: "x", type: "vendor.unknown.thing", data: {} }], edges: [] };
    expect(deriveDefaultSurfaceConfig(exotic).readouts).toHaveLength(0);
    expect(describeWorkflowSteps(exotic)[0].family).toBe("prepare");
  });
});
