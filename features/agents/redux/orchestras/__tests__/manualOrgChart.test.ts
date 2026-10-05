import reducer, { orchestrasActions as a } from "../slice";

const edge = (managerId: string, reportId: string, edgeId = `${managerId}>${reportId}`) => ({
  edgeId,
  managerId,
  reportId,
  kind: "reports_to" as const,
});

describe("manual org chart links in the store", () => {
  const start = reducer(undefined, { type: "@@init" });

  it("a read that started before a removal does not bring the link back", () => {
    let s = reducer(start, a.manualOrgEdgeAdded(edge("agent:a", "agent:b")));
    const startedAtSeq = s.manualOrgChart.writeSeq; // read begins
    s = reducer(s, a.manualOrgEdgeRemoved({ managerId: "agent:a", reportId: "agent:b" }));
    s = reducer(s, a.manualOrgFulfilled({ managerIds: ["agent:a"], edges: [edge("agent:a", "agent:b")], startedAtSeq }));
    expect(s.manualOrgChart.edges).toHaveLength(0);
  });

  it("a read that started after the removal is believed", () => {
    let s = reducer(start, a.manualOrgEdgeRemoved({ managerId: "agent:a", reportId: "agent:b" }));
    const startedAtSeq = s.manualOrgChart.writeSeq;
    s = reducer(s, a.manualOrgFulfilled({ managerIds: ["agent:a"], edges: [edge("agent:a", "agent:b")], startedAtSeq }));
    expect(s.manualOrgChart.edges).toHaveLength(1);
  });

  it("a read that started before a re-type does not revert the kind", () => {
    let s = reducer(start, a.manualOrgEdgeAdded({ ...edge("agent:a", "agent:b"), kind: "hands_off_to" as never }));
    const startedAtSeq = s.manualOrgChart.writeSeq;
    s = reducer(s, a.manualOrgEdgeRemoved({ managerId: "agent:a", reportId: "agent:b" }));
    s = reducer(s, a.manualOrgEdgeAdded(edge("agent:a", "agent:b")));
    s = reducer(
      s,
      a.manualOrgFulfilled({
        managerIds: ["agent:a"],
        edges: [{ ...edge("agent:a", "agent:b"), kind: "hands_off_to" as never }],
        startedAtSeq,
      }),
    );
    expect(s.manualOrgChart.edges.map((e) => e.kind)).toEqual(["reports_to"]);
  });

  it("a read never erases a link made while it was in flight", () => {
    let s = start;
    const startedAtSeq = s.manualOrgChart.writeSeq;
    s = reducer(s, a.manualOrgEdgeAdded(edge("agent:a", "agent:c")));
    s = reducer(s, a.manualOrgFulfilled({ managerIds: ["agent:a"], edges: [], startedAtSeq }));
    expect(s.manualOrgChart.edges.map((e) => e.reportId)).toEqual(["agent:c"]);
  });
});
