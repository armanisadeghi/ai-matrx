// A TABLE COMES BACK PASS BY PASS (lane TABLE-ACTIONS, 2026-10-03).
//
// Cedar Ridge Physical Therapy restores "Home Exercise Plans" (20 plans, three patient forms, two
// saved views, a dashboard, a checklist) from the Data home's Archived filter, the organization hub
// and the Trash. One `custom.record_restore` call timed out on a bigger table; `restoreTableIn`
// loops `custom.table_restore` until the store says done. The pass answers are what the door
// returned on the nightly clone for that table (admin@admin.com's authenticated seat).
//
// Breaks this catches: stopping after one pass; not halving on a statement timeout (or halving on
// any refusal); a store without the door leaving the table archived; the Trash's carry-on turning a
// Record (not a Table) into a refusal.

import type { RecordsDataSource } from "@ai-matrx/records";

import { restoreTableIn, type TableRestorePass } from "../doors";

const CEDAR_RIDGE = "d6d09bd8-67d8-4182-9032-ad3827d1a56d";
const PLANS = "94dc9b1a-1647-4f5a-b166-65806aae444a";

function pass(over: Partial<TableRestorePass>): TableRestorePass {
  return {
    table_id: PLANS, table_name: "Home Exercise Plans", restored: 0, structure_restored: 0,
    built_on_restored: 0, remaining: 0, built_on_remaining: 0, left: 0, table_restored: true,
    done: false, message: "Home Exercise Plans is back; 4 records and 5 things built on it still to bring back.",
    ...over,
  };
}
const FIRST = pass({ restored: 18, structure_restored: 7, remaining: 4, built_on_remaining: 5 });
const LAST = pass({ restored: 4, built_on_restored: 5, done: true, message: "Home Exercise Plans is back, with everything its archive took." });

type Answer = { data?: unknown; error?: { code: string; message: string } };

function store(script: Record<string, Answer[]>) {
  const calls: Array<{ fn: string; args: Record<string, unknown>; schema: string | undefined }> = [];
  const source = {
    calls,
    rpc(fn: string, args: Record<string, unknown>, options?: { schema?: string }) {
      calls.push({ fn, args, schema: options?.schema });
      const next = script[fn]?.shift();
      if (!next) throw new Error(`unexpected call to ${fn}`);
      return Promise.resolve({ data: next.data ?? null, error: next.error ?? null });
    },
    schema: () => {
      throw new Error("a table comes back through a door, never by writing tables");
    },
  };
  return source as unknown as RecordsDataSource & { calls: typeof calls };
}

describe("restoreTableIn", () => {
  it("calls custom.table_restore pass after pass until the store says done", async () => {
    const source = store({ table_restore: [{ data: FIRST }, { data: LAST }] });
    const heard: number[] = [];
    const answered = await restoreTableIn(source, CEDAR_RIDGE, PLANS, { onPass: (p) => heard.push(p.restored) });
    expect(answered).toEqual({ ok: true, data: LAST });
    expect(heard).toEqual([18, 4]);
    expect(source.calls).toEqual([
      { fn: "table_restore", args: { p_organization_id: CEDAR_RIDGE, p_table_id: PLANS, p_chunk: 20 }, schema: "custom" },
      { fn: "table_restore", args: { p_organization_id: CEDAR_RIDGE, p_table_id: PLANS, p_chunk: 20 }, schema: "custom" },
    ]);
  });

  it("halves the pass on a statement timeout and carries on", async () => {
    const source = store({
      table_restore: [{ error: { code: "57014", message: "canceling statement due to statement timeout" } }, { data: LAST }],
    });
    const answered = await restoreTableIn(source, CEDAR_RIDGE, PLANS);
    expect(answered.ok && answered.data?.done).toBe(true);
    expect(source.calls.map((c) => c.args.p_chunk)).toEqual([20, 10]);
  });

  it("hands back any other refusal after the passes that landed", async () => {
    const source = store({
      table_restore: [{ data: FIRST }, { error: { code: "23514", message: 'This could not be brought back as it was archived: "Exercise" is refused on its own.' } }],
    });
    const answered = await restoreTableIn(source, CEDAR_RIDGE, PLANS);
    expect(answered).toEqual({
      ok: false,
      error: { message: 'This could not be brought back as it was archived: "Exercise" is refused on its own.', sqlstate: "23514" },
    });
  });

  it("brings the table back through the one-call restore on a store without the door yet", async () => {
    const source = store({
      table_restore: [{ error: { code: "PGRST202", message: "Could not find the function custom.table_restore" } }],
      record_restore: [{ data: null }],
    });
    const answered = await restoreTableIn(source, CEDAR_RIDGE, PLANS);
    expect(answered).toEqual({ ok: true, data: null });
    expect(source.calls.map((c) => c.fn)).toEqual(["table_restore", "record_restore"]);
  });

  it.each([
    ["a Record, not a Table", "02000"],
    ["a store without the door", "PGRST202"],
  ])("the Trash's carry-on answers nothing to do for %s", async (_name, code) => {
    const source = store({ table_restore: [{ error: { code, message: "There is no such table in this organization." } }] });
    const answered = await restoreTableIn(source, CEDAR_RIDGE, PLANS, { carryOnOnly: true });
    expect(answered).toEqual({ ok: true, data: null });
    expect(source.calls).toHaveLength(1);
  });
});
