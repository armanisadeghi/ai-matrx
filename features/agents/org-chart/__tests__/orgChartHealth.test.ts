import { orgChartHealth } from "../orgChartHealth";
import type { AgentOrgNodeData } from "../buildAgentOrgForest";
import type { OrgChartTreeNode } from "@/components/official/org-chart/layout";

const node = (
  key: string,
  data: Partial<AgentOrgNodeData>,
  children: OrgChartTreeNode<AgentOrgNodeData>[] = [],
): OrgChartTreeNode<AgentOrgNodeData> => ({
  key,
  edgeKind: "directs",
  children,
  data: {
    boxId: `agent:${key}`,
    boxType: "agent",
    entityId: key,
    edgeKind: "directs",
    parentId: null,
    roleTitle: null,
    isConductor: false,
    accent: null,
    mode: null,
    pending: false,
    unavailable: false,
    otherPlacements: 0,
    loop: false,
    ...data,
  } as AgentOrgNodeData,
});

describe("org chart health", () => {
  const forest = [
    node("boss", { isConductor: true }, [
      node("w1", { otherPlacements: 2 }),
      node("w2", { unavailable: true }),
    ]),
    node("loose", {}),
    node("seat", { boxType: "position", entityId: "p1", boxId: "position:p1" }),
  ];
  const run = (spreadWarnAt: number | null) =>
    orgChartHealth(forest, {
      activity: { w2: { state: "failed", at: "2026-10-05T00:00:00Z", running: 0 }, loose: { state: "stalled", at: "2026-10-05T00:00:00Z", running: 0 } },
      spreadWarnAt,
      isOpenPosition: (id) => id === "p1",
    });

  it("groups every issue with the boxes it names", () => {
    const byId = Object.fromEntries(run(3).map((h) => [h.id, h.keys]));
    expect(byId).toEqual({
      couldnt_load: ["w2"],
      failing: ["w2"],
      stalled: ["loose"],
      spread: ["w1"],
      open_position: ["seat"],
      not_on_team: ["loose"],
    });
  });

  it("a conductor at the top, or a box with reports, is not 'not on a team'", () => {
    expect(run(3).find((h) => h.id === "not_on_team")?.keys).toEqual(["loose"]);
  });

  it("without the spread knob the spread check is skipped, not guessed", () => {
    expect(run(null).some((h) => h.id === "spread")).toBe(false);
  });
});
