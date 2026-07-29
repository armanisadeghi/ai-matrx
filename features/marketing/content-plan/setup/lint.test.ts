import { lintPlan } from "./lint";
import type { PlanNodeRow } from "../types";

/** Minimal live-row factory — only the fields lint reads. */
function node(partial: Partial<PlanNodeRow> & { id: string }): PlanNodeRow {
  return {
    node_type: "article",
    parent_id: null,
    route: `/${partial.id}`,
    slug: partial.id,
    label: partial.id,
    brief: ["a brief line"],
    primary_keyword_id: "kw",
    ...partial,
  } as PlanNodeRow;
}

const home = node({ id: "home", node_type: "home", route: "/", slug: null as never });

describe("lintPlan", () => {
  it("is clean on a well-formed plan", () => {
    const report = lintPlan([
      home,
      node({ id: "services", node_type: "pillar", parent_id: "home" }),
    ]);
    expect(report.findings).toEqual([]);
    expect(report.nodesChecked).toBe(2);
  });

  it("flags a missing home as an error", () => {
    const report = lintPlan([node({ id: "a" })]);
    expect(report.findings.map((f) => f.key)).toContain("home-missing");
    expect(report.errors).toBeGreaterThan(0);
  });

  it("flags multiple homes", () => {
    const report = lintPlan([home, node({ id: "h2", node_type: "home" })]);
    expect(report.findings.map((f) => f.key)).toContain("home-multiple");
  });

  it("flags orphans whose parent is not live", () => {
    const report = lintPlan([home, node({ id: "lost", parent_id: "gone" })]);
    const finding = report.findings.find((f) => f.key === "orphans");
    expect(finding?.routes).toEqual(["/lost"]);
  });

  it("flags non-kebab slugs and duplicate sibling labels", () => {
    const report = lintPlan([
      home,
      node({ id: "a", slug: "Bad_Slug", label: "Twin", parent_id: "home" }),
      node({ id: "b", label: "twin ", parent_id: "home" }),
    ]);
    const keys = report.findings.map((f) => f.key);
    expect(keys).toContain("bad-slug");
    expect(keys).toContain("duplicate-labels");
    expect(report.findings.find((f) => f.key === "duplicate-labels")?.count).toBe(2);
  });

  it("reports empty briefs and missing keywords as info, not errors", () => {
    const report = lintPlan([
      home,
      node({ id: "a", brief: [], primary_keyword_id: null }),
    ]);
    const brief = report.findings.find((f) => f.key === "no-brief");
    const keyword = report.findings.find((f) => f.key === "no-keyword");
    expect(brief?.severity).toBe("info");
    expect(keyword?.severity).toBe("info");
    expect(report.errors).toBe(0);
  });

  it("reports an empty plan as nothing to check", () => {
    expect(lintPlan([]).nodesChecked).toBe(0);
    expect(lintPlan([]).findings).toEqual([]);
  });
});
