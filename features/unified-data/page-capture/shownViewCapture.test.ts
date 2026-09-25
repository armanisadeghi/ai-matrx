/**
 * V24-TAILS (VERIFIER-24 item 6): a table capture said "Board grouped by: not chosen" while the
 * page showed the person's own look grouped by Trade. The capture now reads the merged view + look
 * the page draws.
 */
import { shownViewSelection } from "./shownViewCapture";

describe("the table capture names the view as drawn", () => {
  it("a personal look's grouping is named as the person's own look", () => {
    const sel = shownViewSelection(
      {
        viewId: "c873cd8d-0000-4000-8000-000000000001",
        viewName: "All records",
        showing: "kanban",
        groupField: "trade",
        dateField: "inspection",
        swimlaneField: null,
        fromLook: ["layout", "groupField", "dateField"],
        fromAddress: [],
        lookDiffers: true,
      },
      null,
    );
    expect(sel["Board grouped by"]).toBe("trade (your own look)");
    expect(sel["Showing"]).toBe("kanban (your own look)");
    expect(sel["Dates from"]).toBe("inspection (your own look)");
    expect(sel["Your look"]).toContain("only you see it");
    expect(JSON.stringify(sel)).not.toContain("not chosen");
  });

  it("the address outranks the look and says so", () => {
    const sel = shownViewSelection(
      { viewId: null, viewName: null, showing: "kanban", groupField: "status", dateField: null, swimlaneField: null, fromLook: [], fromAddress: ["groupField"], lookDiffers: false },
      "status",
    );
    expect(sel["Board grouped by"]).toBe("status (the address, for this visit)");
  });

  it("before the page reports, it says so instead of 'not chosen'", () => {
    expect(shownViewSelection(null, null)["Board grouped by"]).toContain("not known yet");
  });
});
