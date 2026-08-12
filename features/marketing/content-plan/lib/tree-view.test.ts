import { collapseAllTargets, collapseTargetsForLevel } from "./tree-view";
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
