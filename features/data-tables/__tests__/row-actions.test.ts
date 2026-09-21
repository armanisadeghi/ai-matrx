import {
  agentActionMessage,
  buildRowActionOps,
  compileRowAction,
  describeRowAction,
  readRowActions,
  stepsFromRow,
  validateRowActions,
  type RowAction,
  type RowActionField,
} from "../row-actions";

const fields: RowActionField[] = [
  { field_name: "account", display_name: "Account", data_type: "string", field_order: 0 },
  { field_name: "status", display_name: "Status", data_type: "string", field_order: 1 },
  { field_name: "total", display_name: "Total", data_type: "number", field_order: 2 },
  { field_name: "fable", display_name: "Fable", data_type: "number", field_order: 3 },
  { field_name: "reset_date", display_name: "Reset date", data_type: "date", field_order: 4 },
  {
    field_name: "days_left",
    display_name: "Days left",
    data_type: "number",
    field_order: 5,
    metadata: { format: { id: "formula", options: { expression: 'DATEDIFF(TODAY(), {Reset date}, "days")' } } },
  },
];

const newWeek: RowAction = {
  id: "nw",
  name: "New Week",
  kind: "update",
  steps: [
    { field: "status", set: "value", value: "AVAILABLE" },
    { field: "total", set: "clear" },
    { field: "fable", set: "clear" },
    { field: "reset_date", set: "formula", expression: 'DATEADD({Reset date}, 7, "days")' },
  ],
};

const row = {
  id: "r1",
  data: { account: "Main", status: "EXHAUSTED", total: 412, fable: 88, reset_date: "2026-09-18" },
};

describe("row actions", () => {
  it("Arman's New Week: sets status, clears totals, moves the reset date 7 days", () => {
    const out = compileRowAction(newWeek, row, fields);
    expect(out).toEqual({
      ok: true,
      patch: { status: "AVAILABLE", total: null, fable: null, reset_date: "2026-09-25" },
    });
  });

  it("formula steps see the row BEFORE the action, not each other", () => {
    const action: RowAction = {
      id: "x",
      name: "Swap",
      kind: "update",
      steps: [
        { field: "total", set: "formula", expression: "{Fable}" },
        { field: "fable", set: "formula", expression: "{Total}" },
      ],
    };
    const out = compileRowAction(action, row, fields);
    expect(out).toEqual({ ok: true, patch: { total: 88, fable: 412 } });
  });

  it("refuses to write a calculated column and names it", () => {
    const action: RowAction = {
      id: "x",
      name: "Bad",
      kind: "update",
      steps: [{ field: "days_left", set: "value", value: 3 }],
    };
    const out = compileRowAction(action, row, fields);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("Days left");
    expect(validateRowActions([action], fields).map((p) => p.message).join(" ")).toContain("calculated");
  });

  it("a blank date cell makes DATEADD fail honestly instead of inventing a date", () => {
    const out = compileRowAction(newWeek, { id: "r2", data: { account: "Spare" } }, fields);
    expect(out.ok).toBe(false);
  });

  it("builds ONE merge op per row and stops on the first row it cannot compile", () => {
    const ok = buildRowActionOps(newWeek, [row, { ...row, id: "r3" }], fields);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.ops).toHaveLength(2);
      expect(ok.ops[0]).toMatchObject({ op: "merge", row_id: "r1" });
      expect(ok.patches.get("r3")?.status).toBe("AVAILABLE");
    }
    const bad = buildRowActionOps(newWeek, [row, { id: "r2", data: {} }], fields);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.rowId).toBe("r2");
  });

  it("reads stored actions defensively", () => {
    const actions = readRowActions({
      row_actions: [
        newWeek,
        { id: "", name: "nope" },
        { id: "z", name: "Ask", kind: "agent", prompt: "Summarize", color: "green" },
        { id: "q", name: "Junk steps", kind: "update", steps: [{ field: "status", set: "nonsense" }, 4] },
      ],
    });
    expect(actions.map((a) => a.id)).toEqual(["nw", "z", "q"]);
    expect(actions[1].color).toBe("green");
    expect(actions[2].steps).toEqual([]);
    expect(readRowActions(null)).toEqual([]);
    expect(readRowActions({ row_actions: "x" })).toEqual([]);
  });

  it("validates names, unknown references and double-touched columns", () => {
    const msgs = validateRowActions(
      [
        { id: "a", name: "Dup", kind: "update", steps: [{ field: "status", set: "clear" }, { field: "status", set: "clear" }] },
        { id: "b", name: "dup", kind: "update", steps: [{ field: "total", set: "formula", expression: "{Nope} + 1" }] },
        { id: "c", name: "Agent", kind: "agent", prompt: "" },
      ],
      fields,
    ).map((p) => p.message);
    expect(msgs.some((m) => m.includes("changed twice"))).toBe(true);
    expect(msgs.some((m) => m.includes('Two actions are called "dup"'))).toBe(true);
    expect(msgs.some((m) => m.includes("{Nope}"))).toBe(true);
    expect(msgs.some((m) => m.includes("agent should do"))).toBe(true);
  });

  it("captures a template row as value/clear steps, never a computed column", () => {
    const steps = stepsFromRow({ data: { account: "Main", total: 0, fable: null, days_left: 9 } }, fields);
    expect(steps.map((s) => s.field)).toEqual(["account", "status", "total", "fable", "reset_date"]);
    expect(steps[0]).toEqual({ field: "account", set: "value", value: "Main" });
    expect(steps[1]).toEqual({ field: "status", set: "clear" });
    expect(steps[2]).toEqual({ field: "total", set: "value", value: 0 });
  });

  it("describes an action in plain English", () => {
    expect(describeRowAction(newWeek, fields)).toBe(
      'Sets Status to "AVAILABLE"; clears Total, Fable; calculates Reset date.',
    );
    expect(describeRowAction({ id: "z", name: "Ask", kind: "agent", prompt: "Summarize" }, fields)).toBe(
      "Asks an agent: Summarize",
    );
  });

  it("an agent message carries the prompt, the row by label, and every column", () => {
    const msg = agentActionMessage({
      action: { id: "z", name: "Ask", kind: "agent", prompt: "Summarize this account." },
      tableName: "Coding Accounts",
      rowLabel: "Main",
      row,
      fields,
    });
    expect(msg.startsWith("Summarize this account.")).toBe(true);
    expect(msg).toContain('Row "Main" (id r1) from the table "Coding Accounts"');
    expect(msg).toContain("- Status: EXHAUSTED");
    expect(msg).toContain("- Days left: (empty)");
  });
});
