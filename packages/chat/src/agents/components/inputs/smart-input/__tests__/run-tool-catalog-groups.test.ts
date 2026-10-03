/**
 * THE Tools surface's "Add tools" list is grouped by category so hundreds of
 * tools stay scannable: groups alphabetical, uncategorised tools last under
 * "Other", tools inside a group by the name a person reads.
 */

jest.mock("../../../../../tool-call-visualization/registry/registry", () => ({
  getToolDisplayName: (name: string | null) =>
    (name ?? "Tool").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
}));

import { groupCatalog, groupToolCatalog, toolCategoryLabel } from "../run-tool-catalog";

describe("toolCategoryLabel", () => {
  it("turns a slug into a label and names the missing category", () => {
    expect(toolCategoryLabel("web_search")).toBe("Web search");
    expect(toolCategoryLabel("file-ops")).toBe("File ops");
    expect(toolCategoryLabel(null)).toBe("Other");
    expect(toolCategoryLabel("  ")).toBe("Other");
  });
});

describe("groupToolCatalog", () => {
  const tools = [
    { name: "zillow_lookup", category: "real_estate" },
    { name: "fetch_page", category: "web" },
    { name: "loose_tool", category: null },
    { name: "web_search", category: "web" },
    { name: "ask_question", category: "web" },
    { name: "csv_parse", category: "data" },
  ];

  it("groups alphabetically with Other last and sorts each group by display name", () => {
    const groups = groupToolCatalog(tools);
    expect(groups.map((g) => g.label)).toEqual(["Data", "Real estate", "Web", "Other"]);
    expect(groups.find((g) => g.label === "Web")?.tools.map((t) => t.name)).toEqual([
      "ask_question",
      "fetch_page",
      "web_search",
    ]);
  });

  it("keeps every tool exactly once", () => {
    const groups = groupToolCatalog(tools);
    const names = groups.flatMap((g) => g.tools.map((t) => t.name)).sort();
    expect(names).toEqual(tools.map((t) => t.name).sort());
  });

  it("is empty for an empty catalog", () => {
    expect(groupToolCatalog([])).toEqual([]);
  });
});

describe("groupCatalog (skills use it by type)", () => {
  it("groups any item by a key with Other last, sorted by the given name", () => {
    const skills = [
      { label: "Weekly report", skillType: "workflow" },
      { label: "Table block", skillType: "render_block" },
      { label: "Brand voice", skillType: "convention" },
      { label: "Ad hoc", skillType: "" },
      { label: "Daily standup", skillType: "workflow" },
    ];
    const groups = groupCatalog(skills, (s) => s.skillType, (s) => s.label);
    expect(groups.map((g) => g.label)).toEqual(["Convention", "Render block", "Workflow", "Other"]);
    expect(groups[2].items.map((s) => s.label)).toEqual(["Daily standup", "Weekly report"]);
  });
});
