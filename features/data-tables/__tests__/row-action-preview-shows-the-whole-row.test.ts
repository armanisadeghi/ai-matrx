/**
 * Arman, 2026-09-21, on the row-action preview: "you need to show a preview of
 * the actual row, not just the individual items being updated … show the row
 * as though it's getting live changes." The preview is the WHOLE row, every
 * column in column order, before and after, with the changed cells marked — a
 * formula step shows the value it works out, and a formula column that reads a
 * changed cell shows its recomputed value.
 */
import { previewRowAction, type RowAction, type RowActionField } from "../row-actions";

const fields: RowActionField[] = [
  { field_name: "status", display_name: "Status", data_type: "string", field_order: 1 },
  { field_name: "account", display_name: "Account", data_type: "string", field_order: 0 },
  { field_name: "total", display_name: "Total", data_type: "number", field_order: 2 },
  { field_name: "notes", display_name: "Notes", data_type: "string", field_order: 3 },
  { field_name: "reset_date", display_name: "Reset date", data_type: "date", field_order: 4 },
  {
    field_name: "next_reset",
    display_name: "Next reset",
    data_type: "date",
    field_order: 5,
    metadata: { format: { id: "formula", options: { formula: { expression: 'DATEADD({Reset date}, 7, "days")', resultFormat: "date" } } } },
  },
];

const newWeek: RowAction = {
  id: "nw",
  name: "New Week",
  kind: "update",
  steps: [
    { field: "status", set: "value", value: "AVAILABLE" },
    { field: "total", set: "clear" },
    { field: "reset_date", set: "formula", expression: 'DATEADD({Reset date}, 7, "days")' },
  ],
};

const row = {
  id: "r1",
  data: { account: "Main", status: "EXHAUSTED", total: 412, notes: "renews weekly", reset_date: "2026-09-18" },
};

describe("the row-action preview shows the whole row", () => {
  it("lists EVERY column in column order, not only the ones the action writes", () => {
    const out = previewRowAction(newWeek, row, fields);
    if (!out.ok) throw new Error(out.error);
    expect(out.cells.map((c) => c.fieldName)).toEqual([
      "account",
      "status",
      "total",
      "notes",
      "reset_date",
      "next_reset",
    ]);
  });

  it("marks exactly the cells that change, keeps the rest as they are", () => {
    const out = previewRowAction(newWeek, row, fields);
    if (!out.ok) throw new Error(out.error);
    const by = Object.fromEntries(out.cells.map((c) => [c.fieldName, c]));
    expect(by.account).toMatchObject({ before: "Main", after: "Main", changed: false, how: null });
    expect(by.notes).toMatchObject({ before: "renews weekly", after: "renews weekly", changed: false });
    expect(by.status).toMatchObject({ before: "EXHAUSTED", after: "AVAILABLE", changed: true, how: "value" });
    expect(by.total).toMatchObject({ before: 412, after: null, changed: true, how: "clear" });
    // A formula step shows the value it works out on THIS row.
    expect(by.reset_date).toMatchObject({ before: "2026-09-18", after: "2026-09-25", changed: true, how: "formula" });
    // Status, Total, Reset date, and the Next reset formula that reads Reset date.
    expect(out.changedCount).toBe(4);
  });

  it("recomputes a formula column that reads a changed cell", () => {
    const out = previewRowAction(newWeek, row, fields);
    if (!out.ok) throw new Error(out.error);
    const next = out.cells.find((c) => c.fieldName === "next_reset")!;
    expect(next.computed).toBe(true);
    expect(String(next.before).slice(0, 10)).toBe("2026-09-25");
    expect(String(next.after).slice(0, 10)).toBe("2026-10-02");
    expect(next.changed).toBe(true);
  });

  it("a step that writes the value already there is not marked as a change", () => {
    const action: RowAction = { id: "s", name: "Same", kind: "update", steps: [{ field: "account", set: "value", value: "Main" }] };
    const out = previewRowAction(action, row, fields);
    if (!out.ok) throw new Error(out.error);
    expect(out.changedCount).toBe(0);
  });

  it("says why when the action cannot run on this row", () => {
    const out = previewRowAction(newWeek, { id: "r2", data: { account: "Blank" } }, fields);
    expect(out.ok).toBe(false);
  });
});
