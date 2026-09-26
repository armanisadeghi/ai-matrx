/**
 * The Table settings write targets check an agent's row action exactly as the
 * Save action button checks a person's (register ARE-011): a formula that does
 * not parse, a column that does not exist, or a calculated column is refused
 * with the reason, so "write this formula for me" never stages junk.
 */
import { rowActionFromAgent, stepFormulaFromAgent } from "./RowActionsEditor";

const columns = [
  { id: "1", field_name: "on_hand", display_name: "On hand", data_type: "number", field_order: 1 },
  { id: "2", field_name: "reorder_point", display_name: "Reorder point", data_type: "number", field_order: 2 },
  { id: "3", field_name: "status", display_name: "Status", data_type: "string", field_order: 3 },
] as never[];

describe("row_action_step_formula", () => {
  it("accepts a formula over real columns, by machine or display name", () => {
    const { field, expression } = stepFormulaFromAgent(
      { field: "Status", expression: 'IF({On hand} < {Reorder point}, "Reorder", "OK")' },
      columns,
    );
    expect((field as { field_name: string }).field_name).toBe("status");
    expect(expression).toBe('IF({On hand} < {Reorder point}, "Reorder", "OK")');
  });

  it("refuses a formula that does not parse, with where it breaks", () => {
    expect(() => stepFormulaFromAgent({ field: "status", expression: "IF({On hand} < " }, columns)).toThrow(
      /does not parse/,
    );
  });

  it("refuses a column that cannot take the result, naming the real ones", () => {
    expect(() => stepFormulaFromAgent({ field: "budget", expression: "1" }, columns)).toThrow(/on_hand/);
  });
});

describe("editing_row_action", () => {
  it("stages a whole update action and coerces a typed value to its column", () => {
    const action = rowActionFromAgent(
      {
        name: "Restock",
        kind: "update",
        steps: [
          { field: "on_hand", set: "value", value: "40" },
          { field: "status", set: "formula", expression: '"Restocked"' },
        ],
      },
      "act-1",
      columns,
    );
    expect(action.steps?.[0]).toEqual({ field: "on_hand", set: "value", value: 40 });
    expect(action.id).toBe("act-1");
  });

  it("refuses a step that references a column the table does not have", () => {
    expect(() =>
      rowActionFromAgent(
        { name: "Restock", kind: "update", steps: [{ field: "status", set: "formula", expression: "{Budget} * 2" }] },
        "act-1",
        columns,
      ),
    ).toThrow(/no column is called \{Budget\}/);
  });
});
