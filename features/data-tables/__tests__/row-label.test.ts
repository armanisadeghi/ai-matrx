import {
  defaultRowLabelField,
  effectiveRowLabel,
  isRowLabelField,
  readRowLabel,
  rowLabelOrFallback,
  rowLabelText,
} from "../row-label";

/** A contacts table: the row label is what a person is called everywhere. */
const fields = [
  { field_name: "id_code", display_name: "Code", data_type: "integer", field_order: 0, metadata: { format: { id: "autonumber" } } },
  { field_name: "first", display_name: "First name", data_type: "string", field_order: 1 },
  { field_name: "last", display_name: "Last name", data_type: "string", field_order: 2 },
  { field_name: "since", display_name: "Customer since", data_type: "date", field_order: 3 },
];
const row = { id: "4f2a9c11-0000-4000-8000-000000000000", data: { id_code: 7, first: "Emily", last: "Parson", since: "2024-03-09" } };

describe("row label", () => {
  it("reads a stored config and rejects malformed ones", () => {
    expect(readRowLabel({ row_label: { kind: "field", field: "last" } })).toEqual({ kind: "field", field: "last" });
    expect(readRowLabel({ row_label: { kind: "formula", expression: "{First name}" } })).toEqual({ kind: "formula", expression: "{First name}" });
    expect(readRowLabel({ row_label: { kind: "field" } })).toBeNull();
    expect(readRowLabel({ row_label: { kind: "formula", expression: "  " } })).toBeNull();
    expect(readRowLabel(null)).toBeNull();
  });

  it("defaults to the first ordinary column — never an autonumber or a blob", () => {
    expect(defaultRowLabelField(fields)?.field_name).toBe("first");
    expect(effectiveRowLabel(null, fields)).toEqual({ kind: "field", field: "first" });
    expect(isRowLabelField("first", null, fields)).toBe(true);
    expect(isRowLabelField("last", null, fields)).toBe(false);
  });

  it("falls back when the chosen label column was deleted", () => {
    expect(effectiveRowLabel({ row_label: { kind: "field", field: "gone" } }, fields)).toEqual({ kind: "field", field: "first" });
  });

  it("names a row by one column, through that column's format", () => {
    expect(rowLabelText(row, fields, { kind: "field", field: "last" }).text).toBe("Parson");
    expect(rowLabelText(row, fields, { kind: "field", field: "since" }).text).toMatch(/2024/);
    expect(rowLabelText({ data: {} }, fields, { kind: "field", field: "last" }).text).toBe("");
  });

  it("names a row by merging columns with a formula", () => {
    const cfg = { kind: "formula" as const, expression: '{First name} & " " & {Last name}' };
    expect(rowLabelText(row, fields, cfg).text).toBe("Emily Parson");
    expect(rowLabelText({ data: { first: "Emily" } }, fields, cfg).text).toBe("Emily");
    expect(rowLabelText(row, fields, { kind: "formula", expression: "{Nope} & 1" }).problem).toMatch(/Nope/);
    expect(rowLabelText(row, fields, { kind: "formula", expression: "1 +" }).text).toBe("");
  });

  it("offers a short honest stand-in when the label is empty", () => {
    expect(rowLabelOrFallback({ id: row.id, data: {} }, fields, { kind: "field", field: "last" })).toBe("Row 4f2a9c11");
  });
});
