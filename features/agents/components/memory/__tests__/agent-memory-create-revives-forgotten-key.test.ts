/**
 * Creating a memory whose key the person FORGOT (archived) revives that row —
 * the same rule as the agent tool's `memory:store` — instead of shadowing it
 * with a second row. A LIVE memory with the key is never overwritten, and an
 * organization memory carries its organization as scope_id (the agent's
 * organization-scope recall filters on it).
 *
 * Use case: a clinic front-desk lead forgot "Callback window" last week and
 * sets it again today from the Memory manager.
 */

type Row = Record<string, unknown>;
type Call = { op: string; payload?: Row; filters: Array<[string, string, unknown]> };

const calls: Call[] = [];
let rowsForKey: Row[] = [];

function builder(op: string, payload?: Row) {
  const call: Call = { op, payload, filters: [] };
  calls.push(call);
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (col: string, a?: unknown, c?: unknown) => {
    call.filters.push([name, col, c ?? a]);
    return b;
  };
  for (const m of ["eq", "is", "not", "order", "limit"]) b[m] = chain(m);
  b.select = () => b;
  b.single = async () => ({ data: { id: "mem-x", ...(payload ?? {}) }, error: null });
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: op === "select" ? rowsForKey : [], error: null });
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => builder("select"),
        insert: (payload: Row) => builder("insert", payload),
        update: (payload: Row) => builder("update", payload),
      }),
    }),
  },
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async () => "org-clinic" }));

import { createAgentMemory } from "../service/agent-memory.service";

const input = { title: "Callback window", content: "Call back within 6 hours.", importance: 0.7, scope: "user" as const };

beforeEach(() => {
  calls.length = 0;
  rowsForKey = [];
});

it("revives a forgotten key instead of inserting a second row", async () => {
  rowsForKey = [{ id: "mem-old", key: "callback_window", deleted_at: "2026-09-20T10:00:00Z" }];
  await createAgentMemory("user-1", input);
  expect(calls.some((c) => c.op === "insert")).toBe(false);
  const update = calls.find((c) => c.op === "update");
  expect(update?.payload).toMatchObject({ deleted_at: null, content: "Call back within 6 hours." });
  expect(update?.filters).toContainEqual(["eq", "id", "mem-old"]);
});

it("never overwrites a live memory with the same key — the new one gets a suffixed key", async () => {
  rowsForKey = [{ id: "mem-live", key: "callback_window", deleted_at: null }];
  await createAgentMemory("user-1", input);
  expect(calls.some((c) => c.op === "update")).toBe(false);
  const insert = calls.find((c) => c.op === "insert");
  expect(insert?.payload?.key).toMatch(/^callback_window_[a-z0-9]{1,4}$/);
});

it("an organization memory carries its organization as scope_id", async () => {
  await createAgentMemory("user-1", { ...input, scope: "organization" });
  const insert = calls.find((c) => c.op === "insert");
  expect(insert?.payload).toMatchObject({ scope: "organization", scope_id: "org-clinic", key: "callback_window" });
});
