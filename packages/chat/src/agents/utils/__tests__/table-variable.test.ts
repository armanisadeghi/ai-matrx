// The module under test can be swapped for a scratch copy with a planted break (forcing function).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isEmptyTableReference, readTableReference, tableReferenceValue, tableVariableTypeOf } = require(
  process.env.TABLE_VARIABLE_UNDER_TEST ?? "../table-variable",
) as typeof import("../table-variable");
import { collapsedRowKind } from "../../components/inputs/collapsed-row";

const A = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
const B = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";

describe("a Table variable's value is a reference, never text", () => {
  it("reads every shape a reference travels in", () => {
    expect(readTableReference(A)).toEqual([A]);
    expect(readTableReference([A, B, A])).toEqual([A, B]);
    expect(readTableReference(JSON.stringify([A, B]))).toEqual([A, B]);
    expect(readTableReference({ table_id: A })).toEqual([A]);
  });

  it("drops text — a table NAME is never a reference", () => {
    expect(readTableReference("Patient Visits")).toEqual([]);
    expect(isEmptyTableReference("Patient Visits")).toBe(true);
    expect(isEmptyTableReference([])).toBe(true);
  });

  it("stores one id for Table and a list for Tables", () => {
    expect(tableReferenceValue("table", [A, B])).toBe(A);
    expect(tableReferenceValue("table", [])).toBe("");
    expect(tableReferenceValue("tables", [A, B])).toEqual([A, B]);
  });

  it("is picked, never typed, in the inline row", () => {
    expect(tableVariableTypeOf({ type: "tables" })).toBe("tables");
    expect(tableVariableTypeOf({ type: "textarea" })).toBeNull();
    expect(collapsedRowKind({ type: "table" })).toBe("open-editor");
    expect(collapsedRowKind({ type: "textarea" })).toBe("text-line");
  });
});
