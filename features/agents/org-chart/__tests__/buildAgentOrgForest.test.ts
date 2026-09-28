import {
  buildAgentOrgForest,
  wouldCreateLoop,
  type OrchestraShape,
} from "../buildAgentOrgForest";

const orch = (...members: string[]): OrchestraShape => ({
  members: members.map((agentId) => ({ agentId, roleTitle: `${agentId}-role` })),
});

describe("buildAgentOrgForest", () => {
  it("expands a member that is itself an Orchestra into one tree (manager of managers)", () => {
    const orchestras = new Map([
      ["seo", orch("content", "links")],
      ["content", orch("writer", "editor")],
    ]);
    const forest = buildAgentOrgForest({
      orchestras,
      conductorIds: new Set(["seo", "content"]),
      manualEdges: [],
    });
    expect(forest).toHaveLength(1);
    const [seo] = forest;
    expect(seo.data.agentId).toBe("seo");
    expect(seo.children.map((c) => c.data.agentId)).toEqual(["content", "links"]);
    const content = seo.children[0];
    expect(content.data.isConductor).toBe(true);
    expect(content.edgeKind).toBe("automatic");
    expect(content.data.roleTitle).toBe("content-role");
    expect(content.children.map((c) => c.data.agentId)).toEqual(["writer", "editor"]);
    expect(content.children[0].key).toBe("seo/content/writer");
  });

  it("puts a manual box above an automatic subtree and colours each link by kind", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([["content", orch("writer")]]),
      conductorIds: new Set(["content"]),
      manualEdges: [{ edgeId: "m1", managerId: "cmo", reportId: "content" }],
    });
    expect(forest.map((r) => r.data.agentId)).toEqual(["cmo"]);
    const content = forest[0].children[0];
    expect(content.edgeKind).toBe("manual");
    expect(content.children[0].edgeKind).toBe("automatic");
  });

  it("shows a shared agent under every parent and says how many other places it holds", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([
        ["a", orch("shared")],
        ["b", orch("shared")],
      ]),
      conductorIds: new Set(["a", "b"]),
      manualEdges: [],
    });
    const appearances = forest.flatMap((r) => r.children).filter((c) => c.data.agentId === "shared");
    expect(appearances).toHaveLength(2);
    expect(appearances.every((c) => c.data.otherPlacements === 1)).toBe(true);
  });

  it("an automatic link wins over a manual copy of the same link", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([["a", orch("x")]]),
      conductorIds: new Set(["a"]),
      manualEdges: [{ edgeId: "m", managerId: "a", reportId: "x" }],
    });
    expect(forest[0].children).toHaveLength(1);
    expect(forest[0].children[0].edgeKind).toBe("automatic");
  });

  it("cuts a loop where it closes and never drops an agent", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([
        ["a", orch("b")],
        ["b", orch("a")],
      ]),
      conductorIds: new Set(["a", "b"]),
      manualEdges: [],
    });
    // Nobody is parentless, yet both are on the chart.
    expect(forest).toHaveLength(1);
    const top = forest[0];
    const loopBox = top.children[0].children[0];
    expect(loopBox.data.agentId).toBe(top.data.agentId);
    expect(loopBox.data.loop).toBe(true);
    expect(loopBox.children).toHaveLength(0);
  });

  it("marks a Conductor whose Orchestra has not loaded yet as pending", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([["top", orch("sub")]]),
      conductorIds: new Set(["top", "sub"]),
      manualEdges: [],
    });
    expect(forest[0].children[0].data.pending).toBe(true);
  });

  it("builds only under the given roots", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([
        ["a", orch("x")],
        ["b", orch("y")],
      ]),
      conductorIds: new Set(["a", "b"]),
      manualEdges: [],
      rootIds: ["b"],
    });
    expect(forest.map((r) => r.data.agentId)).toEqual(["b"]);
  });
});

describe("wouldCreateLoop", () => {
  const input = {
    orchestras: new Map([["top", orch("mid")]]),
    manualEdges: [{ edgeId: "m", managerId: "mid", reportId: "low" }],
  };
  it("refuses placing an agent under someone already beneath it", () => {
    expect(wouldCreateLoop(input, "low", "top")).toBe(true);
    expect(wouldCreateLoop(input, "top", "top")).toBe(true);
  });
  it("allows an ordinary placement", () => {
    expect(wouldCreateLoop(input, "top", "low")).toBe(false);
  });
});
