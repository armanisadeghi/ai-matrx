// The Data home's archive decides before it draws: small → row leaves at once + toast with Undo,
// no dialog; big → the counted confirm; a refusal puts the row back and says why.

import { archiveTableFromHome } from "../archiveTableFromHome";

const progress = (over: Record<string, unknown>) => ({
  ok: true,
  data: { table_id: "t", table_name: "Leads", archived: 0, remaining: 5, total: 5, archived_total: 0, table_archived: false, done: false, chunk: 20, message: "", confirm_over: 100, ...over },
});

function setup(answers: unknown[]) {
  const calls: unknown[] = [];
  const client = {
    tableArchive: jest.fn(async (args: unknown) => {
      calls.push(args);
      return answers.shift();
    }),
    tableRestoreWhole: jest.fn(),
  };
  const events: string[] = [];
  const notify = { reversible: jest.fn(() => events.push("toast")), success: jest.fn(), error: jest.fn() };
  const run = () =>
    archiveTableFromHome({
      client: client as never,
      tableId: "t",
      notify: notify as never,
      fallbackName: "Leads",
      onOptimisticHide: () => events.push("hide"),
      onRollback: () => events.push("rollback"),
      onRestored: () => events.push("restored"),
    });
  return { run, events, client };
}

it("a small table leaves the list first, then is announced once", async () => {
  const { run, events } = setup([progress({ chunk: 0 }), progress({ done: true, table_archived: true, remaining: 0 })]);
  expect(await run()).toEqual({ outcome: "archived", name: "Leads" });
  expect(events).toEqual(["hide", "toast"]);
});

it("a big table hides nothing and asks for the counted confirm", async () => {
  const { run, events, client } = setup([progress({ remaining: 1430 })]);
  expect(await run()).toEqual({ outcome: "needs-confirm" });
  expect(events).toEqual([]);
  expect(client.tableArchive).toHaveBeenCalledTimes(1);
});

it("a refused pass puts the row back and announces nothing", async () => {
  const refusal = { ok: false, error: { code: "forbidden", message: "Not yours to archive" } };
  const { run, events } = setup([progress({ chunk: 0 }), refusal]);
  const result = await run();
  expect(result.outcome).toBe("refused");
  expect(events).toEqual(["hide", "rollback"]);
});
