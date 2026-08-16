/**
 * Trigger Point registry (R2) — derivation completeness + ordering, label
 * fallbacks, every firing rule (including the client-side edge derivation),
 * deliverable via node settle and via run completion, and unknown-id safety.
 */

import {
  deriveTriggerPoints,
  hasTriggerFired,
  parseTriggerPointId,
  type TriggerPoint,
  type TriggerResolutionState,
  type WorkflowDefinitionLike,
} from "../trigger-points";

const def: WorkflowDefinitionLike = {
  nodes: [
    { id: "n1", data: { label: "Write script", spec_type: "agent" } },
    { id: "n2", data: { spec_type: "tts_generate" } },
    { id: "n3" },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n2", target: "n3" },
  ],
};

function state(overrides: Partial<TriggerResolutionState> = {}): TriggerResolutionState {
  return {
    runStatus: null,
    nodePhases: {},
    marks: new Set<string>(),
    deliverableNodeId: null,
    ...overrides,
  };
}

describe("deriveTriggerPoints", () => {
  it("derives the complete ordered vocabulary: run points, 3 per node, edges, deliverable", () => {
    const points = deriveTriggerPoints(def);
    expect(points.map((p: TriggerPoint) => p.id)).toEqual([
      "run:started",
      "run:completed",
      "run:failed",
      "run:paused",
      "run:interrupted",
      "node:n1:started",
      "node:n1:completed",
      "node:n1:failed",
      "node:n2:started",
      "node:n2:completed",
      "node:n2:failed",
      "node:n3:started",
      "node:n3:completed",
      "node:n3:failed",
      "edge:e1:traversed",
      "edge:e2:traversed",
      "deliverable:ready",
    ]);
  });

  it("stamps kind and node/edge back-references", () => {
    const points = deriveTriggerPoints(def);
    const byId = new Map(points.map((p) => [p.id, p]));
    expect(byId.get("run:completed")).toMatchObject({ kind: "run" });
    expect(byId.get("node:n1:completed")).toMatchObject({ kind: "node", nodeId: "n1" });
    expect(byId.get("edge:e1:traversed")).toMatchObject({ kind: "edge", edgeId: "e1" });
    expect(byId.get("deliverable:ready")).toMatchObject({ kind: "deliverable" });
  });

  it("labels fall back label -> spec_type -> id", () => {
    const points = deriveTriggerPoints(def);
    const byId = new Map(points.map((p) => [p.id, p]));
    expect(byId.get("node:n1:completed")?.label).toBe("When 'Write script' completes");
    expect(byId.get("node:n2:started")?.label).toBe("When 'tts_generate' starts");
    expect(byId.get("node:n3:failed")?.label).toBe("When 'n3' fails");
    // Edge labels use the resolved node display names.
    expect(byId.get("edge:e1:traversed")?.label).toBe(
      "When 'Write script' hands off to 'tts_generate'",
    );
  });

  it("handles an empty definition: run points + deliverable only", () => {
    const points = deriveTriggerPoints({ nodes: [], edges: [] });
    expect(points.map((p) => p.id)).toEqual([
      "run:started",
      "run:completed",
      "run:failed",
      "run:paused",
      "run:interrupted",
      "deliverable:ready",
    ]);
  });
});

describe("hasTriggerFired — run points (literal only)", () => {
  it("no run at all: nothing fires", () => {
    expect(hasTriggerFired("run:started", def, state())).toBe(false);
    expect(hasTriggerFired("run:completed", def, state())).toBe(false);
  });

  it("run:started fires for any post-pending status", () => {
    expect(hasTriggerFired("run:started", def, state({ runStatus: "pending" }))).toBe(false);
    expect(hasTriggerFired("run:started", def, state({ runStatus: "running" }))).toBe(true);
    expect(hasTriggerFired("run:started", def, state({ runStatus: "completed" }))).toBe(true);
    expect(hasTriggerFired("run:started", def, state({ runStatus: "failed" }))).toBe(true);
  });

  it("terminal/paused points match their exact status only", () => {
    expect(hasTriggerFired("run:completed", def, state({ runStatus: "completed" }))).toBe(true);
    expect(hasTriggerFired("run:completed", def, state({ runStatus: "running" }))).toBe(false);
    expect(hasTriggerFired("run:failed", def, state({ runStatus: "failed" }))).toBe(true);
    expect(hasTriggerFired("run:paused", def, state({ runStatus: "paused" }))).toBe(true);
    expect(hasTriggerFired("run:interrupted", def, state({ runStatus: "interrupted" }))).toBe(true);
  });

  it("run:completed does NOT cascade into node or edge points", () => {
    const s = state({ runStatus: "completed" });
    expect(hasTriggerFired("node:n1:completed", def, s)).toBe(false);
    expect(hasTriggerFired("edge:e1:traversed", def, s)).toBe(false);
  });
});

describe("hasTriggerFired — node points", () => {
  it("started fires for running/settled/failed/retrying, not idle/waiting/skipped", () => {
    for (const phase of ["running", "settled", "failed", "retrying"] as const) {
      expect(hasTriggerFired("node:n1:started", def, state({ nodePhases: { n1: phase } }))).toBe(
        true,
      );
    }
    for (const phase of ["idle", "waiting", "skipped"] as const) {
      expect(hasTriggerFired("node:n1:started", def, state({ nodePhases: { n1: phase } }))).toBe(
        false,
      );
    }
  });

  it("completed fires only on settled; failed only on failed", () => {
    expect(hasTriggerFired("node:n1:completed", def, state({ nodePhases: { n1: "settled" } }))).toBe(
      true,
    );
    expect(hasTriggerFired("node:n1:completed", def, state({ nodePhases: { n1: "running" } }))).toBe(
      false,
    );
    expect(hasTriggerFired("node:n1:completed", def, state({ nodePhases: { n1: "failed" } }))).toBe(
      false,
    );
    expect(hasTriggerFired("node:n1:failed", def, state({ nodePhases: { n1: "failed" } }))).toBe(
      true,
    );
    expect(hasTriggerFired("node:n1:failed", def, state({ nodePhases: { n1: "settled" } }))).toBe(
      false,
    );
  });

  it("a node with no reported phase reads as idle", () => {
    expect(hasTriggerFired("node:n1:started", def, state())).toBe(false);
  });
});

describe("hasTriggerFired — edge derivation (no server edge events)", () => {
  it("fires when source is settled AND target has left idle", () => {
    expect(
      hasTriggerFired("edge:e1:traversed", def, state({ nodePhases: { n1: "settled", n2: "running" } })),
    ).toBe(true);
    expect(
      hasTriggerFired("edge:e1:traversed", def, state({ nodePhases: { n1: "settled", n2: "settled" } })),
    ).toBe(true);
  });

  it("does NOT fire when the target is still idle", () => {
    expect(
      hasTriggerFired("edge:e1:traversed", def, state({ nodePhases: { n1: "settled" } })),
    ).toBe(false);
    expect(
      hasTriggerFired("edge:e1:traversed", def, state({ nodePhases: { n1: "settled", n2: "idle" } })),
    ).toBe(false);
  });

  it("does NOT fire when the source has not settled", () => {
    expect(
      hasTriggerFired("edge:e1:traversed", def, state({ nodePhases: { n1: "running", n2: "running" } })),
    ).toBe(false);
    expect(
      hasTriggerFired("edge:e1:traversed", def, state({ nodePhases: { n1: "failed", n2: "running" } })),
    ).toBe(false);
  });

  it("an edge id not in the definition resolves false", () => {
    expect(
      hasTriggerFired("edge:ghost:traversed", def, state({ nodePhases: { n1: "settled", n2: "running" } })),
    ).toBe(false);
  });
});

describe("hasTriggerFired — deliverable and marks", () => {
  it("deliverable:ready via the configured node's settle", () => {
    const s = state({ deliverableNodeId: "n2", nodePhases: { n2: "settled" } });
    expect(hasTriggerFired("deliverable:ready", def, s)).toBe(true);
    expect(
      hasTriggerFired("deliverable:ready", def, state({ deliverableNodeId: "n2", nodePhases: { n2: "running" } })),
    ).toBe(false);
  });

  it("deliverable:ready via run completion even with no deliverable node", () => {
    expect(hasTriggerFired("deliverable:ready", def, state({ runStatus: "completed" }))).toBe(true);
    expect(hasTriggerFired("deliverable:ready", def, state({ runStatus: "running" }))).toBe(false);
  });

  it("mark:<name> fires from the marks set", () => {
    const s = state({ marks: new Set(["script-approved"]) });
    expect(hasTriggerFired("mark:script-approved", def, s)).toBe(true);
    expect(hasTriggerFired("mark:other", def, s)).toBe(false);
  });
});

describe("unknown / malformed ids are safe", () => {
  it.each([
    "",
    "banana",
    "run:exploded",
    "node:n1",
    "node::started",
    "node:n1:progress",
    "edge:e1",
    "edge:e1:started",
    "mark:",
    "deliverable:done",
  ])("hasTriggerFired(%j) is false and parse returns null", (id) => {
    expect(hasTriggerFired(id, def, state({ runStatus: "completed" }))).toBe(false);
    expect(parseTriggerPointId(id)).toBeNull();
  });
});

describe("parseTriggerPointId", () => {
  it("parses each kind", () => {
    expect(parseTriggerPointId("run:paused")).toEqual({ kind: "run", event: "paused" });
    expect(parseTriggerPointId("node:n1:completed")).toEqual({
      kind: "node",
      nodeId: "n1",
      event: "completed",
    });
    expect(parseTriggerPointId("edge:e1:traversed")).toEqual({
      kind: "edge",
      edgeId: "e1",
      event: "traversed",
    });
    expect(parseTriggerPointId("deliverable:ready")).toEqual({
      kind: "deliverable",
      event: "ready",
    });
    expect(parseTriggerPointId("mark:approved")).toEqual({ kind: "mark", name: "approved" });
  });

  it("node/edge ids containing colons keep the event as the last segment", () => {
    expect(parseTriggerPointId("node:ns:step:1:started")).toEqual({
      kind: "node",
      nodeId: "ns:step:1",
      event: "started",
    });
    expect(parseTriggerPointId("edge:a:b:traversed")).toEqual({
      kind: "edge",
      edgeId: "a:b",
      event: "traversed",
    });
  });
});
