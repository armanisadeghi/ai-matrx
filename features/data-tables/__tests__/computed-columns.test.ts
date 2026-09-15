import {
  formulaColumnsOf,
  isFormulaColumn,
  withComputedColumns,
} from "../formulas";

/**
 * `withComputedColumns` is THE injection point every reader of table rows uses
 * (grid page, copy/export, client sort, agent scope). These tests pin the
 * contract the viewer used to carry inline — same resolution rules, same
 * error keys — so moving it could not have changed a single rendered value.
 */

const price = { field_name: "price", display_name: "Price", data_type: "number" };
const qty = { field_name: "qty", display_name: "Quantity", data_type: "number" };
const formula = (expression: string, field_name = "total", display_name = "Total") => ({
  field_name,
  display_name,
  data_type: "string",
  metadata: { format: { id: "formula", options: { formula: { expression } } } },
});

const rows: Array<{ id: string; data: Record<string, unknown> }> = [
  { id: "r1", data: { price: 10, qty: 3, total: null } },
  { id: "r2", data: { price: 2.5, qty: 4, total: null } },
];

describe("isFormulaColumn / formulaColumnsOf", () => {
  it("recognises only a declared formula format", () => {
    expect(isFormulaColumn(price)).toBe(false);
    expect(isFormulaColumn({ ...price, metadata: { format: { id: "currency" } } })).toBe(false);
    expect(isFormulaColumn(formula("{Price} * 2"))).toBe(true);
    expect(isFormulaColumn({ ...price, metadata: "garbage" })).toBe(false);
  });

  it("parses each formula column once, in field order", () => {
    const cols = formulaColumnsOf([price, formula("{Price} * {Quantity}"), qty, formula("1 +", "bad", "Bad")]);
    expect(cols.map((c) => c.field.field_name)).toEqual(["total", "bad"]);
    expect(cols[0].parsed.ok).toBe(true);
    expect(cols[1].parsed.ok).toBe(false);
  });
});

describe("withComputedColumns", () => {
  it("returns the same array untouched when no column is a formula", () => {
    const result = withComputedColumns(rows, [price, qty]);
    expect(result.rows).toBe(rows);
    expect(result.formulaFieldNames.size).toBe(0);
    expect(result.errors.size).toBe(0);
  });

  it("fills a formula column from the row's other cells, by display or machine name", () => {
    const byDisplay = withComputedColumns(rows, [price, qty, formula("{Price} * {Quantity}")]);
    expect(byDisplay.rows.map((r) => r.data.total)).toEqual([30, 10]);
    const byMachine = withComputedColumns(rows, [price, qty, formula("{price} * {qty}")]);
    expect(byMachine.rows.map((r) => r.data.total)).toEqual([30, 10]);
    expect(byDisplay.formulaFieldNames).toEqual(new Set(["total"]));
  });

  it("never mutates the input rows", () => {
    const input = [{ id: "r1", data: { price: 10, qty: 3, total: null } }];
    withComputedColumns(input, [price, qty, formula("{Price} * {Quantity}")]);
    expect(input[0].data.total).toBeNull();
  });

  it("lets a later formula read an earlier one", () => {
    const fields = [
      price,
      qty,
      formula("{Price} * {Quantity}"),
      formula("{Total} * 2", "doubled", "Doubled"),
    ];
    const result = withComputedColumns(rows, fields);
    expect(result.rows.map((r) => r.data.doubled)).toEqual([60, 20]);
  });

  it("treats a column the row never stored as BLANK, not as a missing column", () => {
    // A new row is saved with only the cells someone typed; the rest have no
    // key at all. That is an empty cell (0 in arithmetic), never #ERROR.
    const sparse = [{ id: "new", data: {} as Record<string, unknown> }];
    const result = withComputedColumns(sparse, [price, qty, formula("{Price} * 2")]);
    expect(result.errors.size).toBe(0);
    expect(result.rows[0].data.total).toBe(0);
    // ...and a reference that matches NO column is still the misspelling error.
    const bad = withComputedColumns(sparse, [price, formula("{Prize} * 2")]);
    expect(bad.errors.get("new::total")).toMatch(/Prize/);
  });

  it("records a per-cell error, keyed rowId::field, and leaves the cell null", () => {
    const result = withComputedColumns(rows, [price, qty, formula("{Nope} + 1")]);
    expect(result.rows.every((r) => r.data.total === null)).toBe(true);
    expect(result.errors.get("r1::total")).toMatch(/Nope/);
    expect(result.errors.get("r2::total")).toMatch(/Nope/);
  });

  it("reports a parse error for every row of an unparseable formula", () => {
    const result = withComputedColumns(rows, [price, formula("1 +")]);
    expect(result.errors.size).toBe(2);
    expect(result.rows.every((r) => r.data.total === null)).toBe(true);
  });
});
