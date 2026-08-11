import { resolveBacklinkSortColumn } from "./backlinks-queries";

describe("backlink server sort contract", () => {
  it.each([
    ["enrichment_status", "enrichment_status"],
    ["our_score", "assessment_score"],
    ["relevance", "assessment_relevance_score"],
    ["page_type", "assessment_page_type"],
    ["control", "assessment_control_level"],
    ["action", "assessment_action"],
  ])("maps %s to the durable query field %s", (columnId, expected) => {
    expect(resolveBacklinkSortColumn(columnId)).toBe(expected);
  });

  it("rejects an unknown UI column instead of silently sorting by it", () => {
    expect(resolveBacklinkSortColumn("not_a_real_column")).toBeNull();
  });
});
