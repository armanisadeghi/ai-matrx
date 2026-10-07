import { sheetTextToValues, sheetValuesToText } from "@/features/google-workspace/sheetText";

// A customer's sheet goes into an editable box as TSV and back out to the sheet. Before AP-2's
// fifth check it was split on "\n" then "\t" and joined back the same way, so a cell holding a
// tab, a line break or a quote silently split into extra cells and rows of the customer's sheet.
describe("a Google sheet's cells round-trip through the edit box", () => {
  it("keeps tabs, line breaks, quotes and formulas inside their cells", () => {
    const values = [
      ["Name", "Notes", "Total"],
      ["Castellano & Reyes", "line one\nline two", "=SUM(C3:C9)"],
      ['5" screen', "a\tb", "'kept apostrophe"],
      ["", "", "-5"],
    ];
    const text = sheetValuesToText(values);
    expect(sheetTextToValues(text)).toEqual(values);
  });
  it("reads plain typed TSV the way a person types it", () => {
    expect(sheetTextToValues("a\tb\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("an emptied box still writes one empty cell", () => {
    expect(sheetTextToValues("")).toEqual([[""]]);
    expect(sheetValuesToText([[null, 3]])).toBe("\t3");
  });
});
