const chains: Array<{ calls: Array<[string, unknown[]]> }> = [];
const mockSchema = jest.fn();
const mockReadAllRows = jest.fn();
const mockGuardedUpdate = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: mockSchema } }));
jest.mock("@ai-matrx/data/db", () => ({ readAllRows: mockReadAllRows, guardedUpdate: mockGuardedUpdate }));
jest.mock("@ai-matrx/design-system/data-table", () => ({
  parseTableViewSnapshot: jest.requireActual(
    "/Users/armanisadeghi/code/aidream/apps/shared/design-system/src/data-table/saved-view-snapshot",
  ).parseTableViewSnapshot,
}));

import { createPersonalTableView, listPersonalTableViews, updatePersonalTableView } from "./table-saved-views-service";

function query(response: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder = {
    from: (...args: unknown[]) => { calls.push(["from", args]); return builder; },
    insert: (...args: unknown[]) => { calls.push(["insert", args]); return builder; },
    update: (...args: unknown[]) => { calls.push(["update", args]); return builder; },
    select: (...args: unknown[]) => { calls.push(["select", args]); return builder; },
    single: () => { calls.push(["single", []]); return builder; },
    maybeSingle: () => { calls.push(["maybeSingle", []]); return builder; },
    eq: (...args: unknown[]) => { calls.push(["eq", args]); return builder; },
    is: (...args: unknown[]) => { calls.push(["is", args]); return builder; },
    order: (...args: unknown[]) => { calls.push(["order", args]); return builder; },
    range: (...args: unknown[]) => { calls.push(["range", args]); return builder; },
    setHeader: (...args: unknown[]) => { calls.push(["setHeader", args]); return builder; },
    abortSignal: (...args: unknown[]) => { calls.push(["abortSignal", args]); return Promise.resolve(response); },
  };
  chains.push({ calls });
  return builder;
}

const actor = { userId: "actor-a", accessToken: "token-a", organizationId: "org-a" };
const snapshot = { __kind: "matrx-table-view" as const, version: 1 as const, query: { pageSize: 25, search: "", anyOf: "", columnFilters: {}, sort: null }, columns: { order: ["name"], hidden: [] } };
const row = { id: "view-a", name: "Name", version: 2, definition: { __kind: "matrx-table-view", version: 1, format: "canonical-table-snapshot", snapshot: JSON.stringify(snapshot) } };

describe("table saved views service wiring", () => {
  beforeEach(() => {
    chains.length = 0;
    mockSchema.mockImplementation(() => ({ from: () => query({ data: row, error: null }) }));
    mockGuardedUpdate.mockReset();
  });

  it("requires an explicit organization before create", async () => {
    await expect(createPersonalTableView({ ...actor, organizationId: null }, "sandboxes/active", "Name", snapshot, new AbortController().signal)).rejects.toThrow("Choose an organization");
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it("uses the supplied captured token, owner and signal for a complete table-scoped list", async () => {
    const controller = new AbortController();
    mockReadAllRows.mockImplementationOnce(async (read) => {
      const result = await read({ from: 0, to: 999 });
      expect(result.data).toEqual(row);
      return [row];
    });

    await expect(listPersonalTableViews(actor, "sandboxes/active", controller.signal)).resolves.toHaveLength(1);
    const calls = chains[0]!.calls;
    expect(calls).toEqual(expect.arrayContaining([
      ["eq", ["surface_key", "matrx/table/sandboxes/active"]], ["eq", ["created_by", "actor-a"]],
      ["eq", ["visibility", "personal"]], ["is", ["deleted_at", null]],
      ["setHeader", ["Authorization", "Bearer token-a"]], ["abortSignal", [controller.signal]],
    ]));
  });

  it("writes the captured actor, org, table and Authorization header", async () => {
    await createPersonalTableView(actor, "sandboxes/active", "<script>name</script>", snapshot, new AbortController().signal);
    const calls = chains[0]!.calls;
    expect(calls).toContainEqual(["setHeader", ["Authorization", "Bearer token-a"]]);
    expect(calls).toContainEqual(["insert", [expect.objectContaining({ name: "<script>name</script>", organization_id: "org-a", created_by: "actor-a", surface_key: "matrx/table/sandboxes/active", visibility: "personal" })]]);
  });

  it("passes the pinned version and owner/table/deleted guards to guarded update", async () => {
    mockGuardedUpdate.mockImplementation(async (args) => {
      const response = await args.applyUpdate({ expectedVersion: 2, nextVersion: 3 });
      return { status: "success", row: response.data };
    });
    await updatePersonalTableView(actor, "sandboxes/history", { id: "view-a", name: "Name", version: 2, snapshot }, snapshot, new AbortController().signal);
    expect(mockGuardedUpdate).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 2 }));
    const calls = chains[0]!.calls;
    expect(calls).toEqual(expect.arrayContaining([
      ["eq", ["id", "view-a"]], ["eq", ["version", 2]], ["eq", ["created_by", "actor-a"]],
      ["eq", ["surface_key", "matrx/table/sandboxes/history"]], ["eq", ["visibility", "personal"]], ["is", ["deleted_at", null]],
      ["setHeader", ["Authorization", "Bearer token-a"]],
    ]));
  });
});
