import {
  collapseAllTargets,
  collapseTargetsForLevel,
  collapseVisible,
  filterWithAncestors,
} from "./tree-view";
import { buildPlanTree, type PlanNodeRow, type PlanNodeType } from "../types";

function planNode(
  id: string,
  nodeType: PlanNodeType,
  parentId: string | null,
): PlanNodeRow {
  return {
    attributes: {},
    brief: [],
    cluster_label: null,
    created_at: "2026-08-11T00:00:00.000Z",
    created_by: null,
    deleted_at: null,
    depth: 0,
    id,
    label: id,
    meta_description: null,
    meta_title: null,
    metadata: {},
    needs_reviewer: false,
    node_type: nodeType,
    organization_id: "org",
    page_type_id: null,
    parent_id: parentId,
    pillar_label: null,
    primary_keyword_id: null,
    priority: null,
    route: id === "home" ? "/" : `/${id}`,
    site_id: "site",
    slug: id === "home" ? null : id,
    status_id: null,
    technical_depth: null,
    updated_at: "2026-08-11T00:00:00.000Z",
    updated_by: null,
    version: 1,
    visibility: "internal",
  };
}

const tree = buildPlanTree([
  planNode("home", "home", null),
  planNode("about", "article", "home"),
  planNode("services", "pillar", "home"),
  planNode("consulting", "cluster", "services"),
  planNode("strategy", "article", "consulting"),
]);

describe("content-plan tree collapse targets", () => {
  it("keeps Home open while collapsing every branch below it", () => {
    expect(collapseAllTargets(tree)).toEqual(
      new Set(["services", "consulting"]),
    );
  });

  it("never collapses Home in a level preset", () => {
    expect(collapseTargetsForLevel(tree, "pillars").has("home")).toBe(false);
    expect(collapseTargetsForLevel(tree, "clusters").has("home")).toBe(false);
  });
});

describe("filterWithAncestors", () => {
  const rows = [
    { id: "home", parent_id: null },
    { id: "p1", parent_id: "home" },
    { id: "c1", parent_id: "p1" },
    { id: "a1", parent_id: "c1" },
    { id: "a2", parent_id: "c1" },
    { id: "p2", parent_id: "home" },
    { id: "a5", parent_id: "p2" },
  ];

  it("keeps ancestors of matches and marks them dimmed", () => {
    const { rows: kept, dimmed } = filterWithAncestors(
      rows,
      (row) => row.id === "a1",
    );
    expect(kept.map((row) => row.id)).toEqual(["home", "p1", "c1", "a1"]);
    expect(dimmed).toEqual(new Set(["home", "p1", "c1"]));
  });

  it("returns everything undimmed when all rows match", () => {
    const { rows: kept, dimmed } = filterWithAncestors(rows, () => true);
    expect(kept).toHaveLength(rows.length);
    expect(dimmed.size).toBe(0);
  });
});

describe("collapseVisible", () => {
  const rows = [
    { id: "home", parent_id: null },
    { id: "p1", parent_id: "home" },
    { id: "c1", parent_id: "p1" },
    { id: "a1", parent_id: "c1" },
    { id: "a2", parent_id: "c1" },
    { id: "p2", parent_id: "home" },
    { id: "a5", parent_id: "p2" },
  ];

  it("hides descendants and counts them on the collapsed node", () => {
    const { rows: visible, hiddenCounts } = collapseVisible(
      rows,
      new Set(["p1"]),
    );
    expect(visible.map((row) => row.id)).toEqual(["home", "p1", "p2", "a5"]);
    expect(hiddenCounts.get("p1")).toBe(3);
  });

  it("drops the badge for a collapsed node hidden inside an outer collapse", () => {
    const { rows: visible, hiddenCounts } = collapseVisible(
      rows,
      new Set(["p1", "c1"]),
    );
    expect(visible.map((row) => row.id)).toEqual(["home", "p1", "p2", "a5"]);
    expect(hiddenCounts.get("p1")).toBe(3);
    expect(hiddenCounts.has("c1")).toBe(false);
  });

  it("is a no-op with nothing collapsed", () => {
    const { rows: visible, hiddenCounts } = collapseVisible(rows, new Set());
    expect(visible).toHaveLength(rows.length);
    expect(hiddenCounts.size).toBe(0);
  });
});
