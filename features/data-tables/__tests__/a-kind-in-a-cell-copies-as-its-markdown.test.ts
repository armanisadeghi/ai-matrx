/**
 * Display shows a json cell carrying `__kind` as a kind chip (never JSON), so
 * a COPY of that cell must agree: the kind's markdown on the clipboard, never
 * raw `{"__kind":…}`. Kindless cells copy exactly as before.
 */
import { kindCellCopyText } from "../utils/kind-cell";
import { selectedRowsToTsv } from "../bulk-row-actions";

const KIND = { __kind: "checklist", title: "Packing", items: [{ text: "Passport" }] };
const fields = [
  { field_name: "name", display_name: "Name" },
  { field_name: "plan", display_name: "Plan" },
];

describe("a kind in a data-table cell copies as its markdown", () => {
  it("fixture sentinel: plain JSON.stringify (the old copy) leaks the kind", () => {
    expect(JSON.stringify(KIND)).toContain("__kind");
  });

  it("kindCellCopyText: object, JSON text, unfinished text, kindless", () => {
    expect(kindCellCopyText(KIND)).toContain("Passport");
    expect(kindCellCopyText(KIND)).not.toContain("__kind");
    expect(kindCellCopyText(JSON.stringify(KIND))).toContain("Passport");
    expect(kindCellCopyText('{"__kind":"checklist","items":[{"te')).toMatch(/did not finish/i);
    expect(kindCellCopyText({ a: 1 })).toBeNull();
    expect(kindCellCopyText("hello")).toBeNull();
    expect(kindCellCopyText(null)).toBeNull();
  });

  it("selectedRowsToTsv copies the markdown, not the JSON", () => {
    const tsv = selectedRowsToTsv(
      [
        { id: "1", data: { name: "Trip", plan: KIND } },
        { id: "2", data: { name: "Other", plan: { a: 1 } } },
      ] as never,
      fields,
    );
    expect(tsv).not.toContain("__kind");
    expect(tsv).toContain("Passport");
    expect(tsv).toContain('{""a"":1}');
  });
});
