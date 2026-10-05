/**
 * AN EDIT KEEPS THE VIEW TRUE (lane DATA-V2-BASICS). The decisions the Sheet makes after a cell
 * edit: which edits move the view, which rows left it, and the sentence that says so.
 */
import { editMovesTheView, leftTheViewSentence, rowsThatLeft } from "../edit-keeps-the-view";

describe("an edit keeps the view true", () => {
  it("an edit to the sorted column re-orders; one to a filtered column may hide the row; others do nothing", () => {
    const filters = { status: { mode: "values" as const, values: ["Verified"], includeBlank: false, negate: false } };
    expect(editMovesTheView("plan_type", "plan_type", {})).toBe("order");
    expect(editMovesTheView("status", "plan_type", filters)).toBe("filter");
    expect(editMovesTheView("notes", "plan_type", filters)).toBeNull();
    expect(editMovesTheView("notes", null, {})).toBeNull();
  });

  it("names only the edited rows the view no longer shows, once each", () => {
    const edited = [
      { rowId: "careington", fieldName: "status" },
      { rowId: "delta", fieldName: "status" },
      { rowId: "careington", fieldName: "annual_max_used" },
    ];
    expect(rowsThatLeft(edited, ["delta", "cigna"])).toEqual([{ rowId: "careington", fieldName: "status" }]);
    expect(rowsThatLeft(edited, ["delta", "careington"])).toEqual([]);
  });

  it("says what left and why, in words a person reads", () => {
    expect(leftTheViewSentence([])).toBeNull();
    expect(leftTheViewSentence([{ label: "Careington Discount · Plan 500", effect: "filter", columnName: "Status" }])).toBe(
      '"Careington Discount · Plan 500" no longer matches the filter on Status, so it is hidden.',
    );
    expect(leftTheViewSentence([{ label: "Zoe Alcantar", effect: "order", columnName: "Customer" }])).toBe(
      '"Zoe Alcantar" moved to another page — the table is sorted by Customer.',
    );
    expect(leftTheViewSentence([{ label: "", effect: "order", columnName: "Customer" }])).toBe(
      "The row you changed moved to another page — the table is sorted by Customer.",
    );
    expect(
      leftTheViewSentence([
        { label: "A", effect: "filter", columnName: "Status" },
        { label: "B", effect: "filter", columnName: "Status" },
      ]),
    ).toBe("2 rows you changed no longer match the filter, so they are hidden.");
  });
});
