import { workItemsFooterLabel, workItemsSourceNotice } from "./WorkItemsPanel";

describe("WorkItemsPanel source coverage contract", () => {
  it("labels the loaded window and exact filtered source count separately", () => {
    expect(workItemsFooterLabel(100, 248)).toBe("100 loaded · 248 matching source");
  });

  it("leaves counts to the canonical footer and keeps only the truncation remedy", () => {
    expect(workItemsSourceNotice(true)).toBe(
      "Narrow the filters to inspect the rest.",
    );
    expect(workItemsSourceNotice(false)).toBe("");
  });
});
