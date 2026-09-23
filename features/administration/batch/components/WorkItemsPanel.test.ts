import { workItemsCoverage, workItemsSourceNotice } from "./WorkItemsPanel";

describe("WorkItemsPanel source coverage contract", () => {
  it("keeps a source-filtered page distinct from a client-side cap", () => {
    expect(workItemsCoverage(100, 248)).toEqual({
      loaded: 100,
      matched: 248,
      answeredBy: "source",
      noun: "work item",
    });
  });

  it("states when only the newest source page is rendered", () => {
    expect(workItemsSourceNotice(200, 418, true)).toBe(
      "Showing the newest 200 of 418 matching work items. Narrow the filters to inspect the rest.",
    );
    expect(workItemsSourceNotice(1, 1, false)).toBe(
      "1 matching work item returned by the source.",
    );
  });
});
