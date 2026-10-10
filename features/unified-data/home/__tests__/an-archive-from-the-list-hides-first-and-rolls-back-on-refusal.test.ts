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

// ── NEVER A SILENT PARTIAL ARCHIVE (DATA-DEFECTS-1, 2026-10-10) ────────────────────────────────────
// A 20-row table is several passes (the door stops itself at about a second). A pass that failed or threw
// part way used to leave the row hidden, 9 rows live and no sentence. Now every way out puts the row
// back and says exactly what is left.

it("a pass that throws part way puts the row back and says how many records are still live", async () => {
  const answers: unknown[] = [progress({ chunk: 0, remaining: 20, total: 20 }), progress({ archived: 11, archived_total: 11, remaining: 9, total: 20 })];
  const { run, events, client } = setup(answers);
  client.tableArchive.mockImplementation(async () => {
    const next = answers.shift();
    if (next === undefined) throw new Error("Failed to fetch");
    return next;
  });
  const result = await run();
  expect(result.outcome).toBe("refused");
  if (result.outcome !== "refused") return;
  expect(result.left).toEqual({ archived: 11, remaining: 9, total: 20 });
  expect(result.sentence).toContain("9 of 20 records are still live");
  expect(result.sentence).toContain("Failed to fetch");
  expect(events).toEqual(["hide", "rollback"]);
});

it("a refusal after some passes says what is left, a refusal on the first pass changed nothing", async () => {
  const refusal = { ok: false, error: { code: "forbidden", message: "Not yours to archive" } };
  const part = setup([progress({ chunk: 0, remaining: 20, total: 20 }), progress({ archived: 5, archived_total: 5, remaining: 15, total: 20 }), refusal]);
  const partial = await part.run();
  expect(partial.outcome === "refused" && partial.left).toEqual({ archived: 5, remaining: 15, total: 20 });
  const none = setup([progress({ chunk: 0 }), refusal]);
  const first = await none.run();
  expect(first.outcome === "refused" && first.left).toBeUndefined();
});

it("progress is reported after every pass that did not finish", async () => {
  const answers: unknown[] = [
    progress({ chunk: 0, remaining: 20, total: 20 }),
    progress({ archived: 3, archived_total: 3, remaining: 17, total: 20 }),
    progress({ archived: 5, archived_total: 8, remaining: 12, total: 20 }),
    progress({ done: true, table_archived: true, remaining: 0, total: 20, archived_total: 20 }),
  ];
  const { client } = setup(answers);
  const seen: unknown[] = [];
  await archiveTableFromHome({
    client: client as never,
    tableId: "t",
    notify: { reversible: jest.fn(), success: jest.fn(), error: jest.fn() } as never,
    fallbackName: "Leads",
    onOptimisticHide: () => {},
    onRollback: () => {},
    onRestored: () => {},
    onProgress: (p) => seen.push(p),
  });
  expect(seen).toEqual([
    { archived: 3, remaining: 17, total: 20, name: "Leads" },
    { archived: 8, remaining: 12, total: 20, name: "Leads" },
  ]);
});

it("a run that stops moving ends loudly instead of looping for ever", async () => {
  const stuck = progress({ archived: 0, archived_total: 11, remaining: 9, total: 20 });
  const { run, client, events } = setup([progress({ chunk: 0, remaining: 20, total: 20 })]);
  client.tableArchive.mockImplementation(async (args: unknown) => ((args as { chunk?: number }).chunk === 0 ? progress({ chunk: 0, remaining: 20, total: 20 }) : stuck));
  const result = await run();
  expect(result.outcome).toBe("refused");
  expect(events).toEqual(["hide", "rollback"]);
});
