import { buildAgentOrgForest, crossLinksOf, type OrchestraShape } from "../buildAgentOrgForest";

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
    expect(seo.data.entityId).toBe("seo");
    expect(seo.children.map((c) => c.data.entityId)).toEqual(["content", "links"]);
    const content = seo.children[0];
    expect(content.data.isConductor).toBe(true);
    expect(content.edgeKind).toBe("directs");
    expect(content.data.roleTitle).toBe("content-role");
    expect(content.children.map((c) => c.data.entityId)).toEqual(["writer", "editor"]);
    expect(content.children[0].key).toBe("agent:seo/agent:content/agent:writer");
  });

  it("puts a manual box above an automatic subtree and colours each link by kind", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([["content", orch("writer")]]),
      conductorIds: new Set(["content"]),
      manualEdges: [{ edgeId: "m1", managerId: "agent:cmo", reportId: "agent:content", kind: "reports_to" }],
    });
    expect(forest.map((r) => r.data.entityId)).toEqual(["cmo"]);
    const content = forest[0].children[0];
    expect(content.edgeKind).toBe("reports_to");
    expect(content.children[0].edgeKind).toBe("directs");
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
    const appearances = forest.flatMap((r) => r.children).filter((c) => c.data.entityId === "shared");
    expect(appearances).toHaveLength(2);
    expect(appearances.every((c) => c.data.otherPlacements === 1)).toBe(true);
  });

  it("an automatic link wins over a manual copy of the same link", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([["a", orch("x")]]),
      conductorIds: new Set(["a"]),
      manualEdges: [{ edgeId: "m", managerId: "agent:a", reportId: "agent:x", kind: "reports_to" }],
    });
    expect(forest[0].children).toHaveLength(1);
    expect(forest[0].children[0].edgeKind).toBe("directs");
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
    expect(loopBox.data.boxId).toBe(top.data.boxId);
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

  it("an Orchestra that failed to load says so instead of loading forever", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([["top", orch("sub")]]),
      conductorIds: new Set(["top", "sub"]),
      failedIds: new Set(["sub"]),
      manualEdges: [],
    });
    const sub = forest[0].children[0].data;
    expect(sub.pending).toBe(false);
    expect(sub.unavailable).toBe(true);
  });

  it("keeps hand-offs and dotted lines out of the tree but puts both ends on the chart", () => {
    const manualEdges = [
      { edgeId: "h", managerId: "intake", reportId: "expert", kind: "hands_off_to" as const },
      { edgeId: "d", managerId: "lead", reportId: "advisor", kind: "dotted_line" as const },
    ];
    const forest = buildAgentOrgForest({ orchestras: new Map(), conductorIds: new Set(), manualEdges });
    expect(forest.map((r) => r.data.entityId).sort()).toEqual(["advisor", "expert", "intake", "lead"]);
    expect(forest.every((r) => r.children.length === 0)).toBe(true);
    expect(crossLinksOf(manualEdges).map((l) => `${l.fromId}>${l.toId}:${l.kind}`)).toEqual([
      "intake>expert:hands_off_to",
      "lead>advisor:dotted_line",
    ]);
  });

  it("puts people, teams and positions on the chart with agents under them", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([["seo", orch("writer")]]),
      conductorIds: new Set(["seo"]),
      manualEdges: [
        { edgeId: "1", managerId: "user:arman", reportId: "position:seo-lead", kind: "reports_to" },
        { edgeId: "2", managerId: "position:seo-lead", reportId: "agent:seo", kind: "reports_to" },
      ],
      standalone: ["position:open-seat"],
    });
    const top = forest.find((r) => r.data.boxId === "user:arman")!;
    expect(top.data.boxType).toBe("user");
    const seat = top.children[0];
    expect(seat.data.boxType).toBe("position");
    expect(seat.children[0].data.entityId).toBe("seo");
    expect(seat.children[0].children[0].edgeKind).toBe("directs");
    expect(forest.some((r) => r.data.boxId === "position:open-seat")).toBe(true);
  });

  it("builds only under the given roots", () => {
    const forest = buildAgentOrgForest({
      orchestras: new Map([
        ["a", orch("x")],
        ["b", orch("y")],
      ]),
      conductorIds: new Set(["a", "b"]),
      manualEdges: [],
      rootIds: ["agent:b"],
    });
    expect(forest.map((r) => r.data.entityId)).toEqual(["b"]);
  });
});
