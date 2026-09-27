/**
 * chat.agent_task is ARCHIVED, never destroyed — and an archived task never
 * shows again.
 *
 * Chair rule (Arman, 2026-09-26): every delete archives through the table's
 * soft-delete column. `chat.agent_task` has `deleted_at`, so remove / clear
 * stamp it, and `listTasks` (the TaskPanel's reader) skips archived rows. The
 * server's `tasks` tool (aidream `agent_tasks_tool.py`) archives the same rows,
 * so a reader that forgot the filter would put tasks the agent removed back on
 * screen.
 *
 * The fake below is an in-memory table that honours exactly the PostgREST verbs
 * the service sends (`eq`, `is`, `update`, `delete`), so a missing filter or a
 * hard delete fails here by effect, not by string match.
 */

type Row = {
  id: string;
  conversation_id: string;
  title: string;
  status: string;
  position: number;
  deleted_at: string | null;
};

const table: Row[] = [];

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Array<(r: Row) => boolean> = [];
  private op: "select" | "update" | "delete" = "select";
  private patch: Partial<Row> = {};
  private returning = false;

  select(): this {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  update(patch: Partial<Row>): this {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: keyof Row, value: unknown): this {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  is(col: keyof Row, value: null): this {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }
  then<T1 = { data: unknown; error: null }, T2 = never>(
    ok?: ((v: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
    fail?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(ok, fail);
  }
  private run(): { data: unknown; error: null } {
    const hit = table.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "delete") {
      for (const r of hit) table.splice(table.indexOf(r), 1);
    } else if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.patch);
    }
    const data = hit.map((r) => ({ ...r }));
    return { data: this.op === "select" || this.returning ? data : null, error: null };
  }
}

jest.mock("../supabase-typed", () => ({
  db: { schema: () => ({ from: () => new Query() }) },
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async () => "org-1" }));

import {
  clearAllTasks,
  clearCompletedTasks,
  listTasks,
  removeTask,
} from "../agent-task.service";

const CONVO = "conv-rincon";

function seed(): void {
  table.length = 0;
  table.push(
    { id: "t1", conversation_id: CONVO, title: "Call Rincon Plumbing back", status: "done", position: 0, deleted_at: null },
    { id: "t2", conversation_id: CONVO, title: "Draft the quote", status: "in_progress", position: 1, deleted_at: null },
    { id: "t3", conversation_id: CONVO, title: "Book the site visit", status: "pending", position: 2, deleted_at: null },
  );
}

const titles = async () => (await listTasks(CONVO)).map((t) => t.title);

describe("chat.agent_task archive", () => {
  beforeEach(seed);

  it("removeTask archives the row and listTasks no longer shows it", async () => {
    await removeTask("t2");
    expect(await titles()).toEqual(["Call Rincon Plumbing back", "Book the site visit"]);
    expect(table).toHaveLength(3);
    expect(table.find((r) => r.id === "t2")?.deleted_at).not.toBeNull();
  });

  it("listTasks hides a task the server's tasks tool archived", async () => {
    table[0].deleted_at = "2026-09-26T10:00:00.000Z";
    expect(await titles()).toEqual(["Draft the quote", "Book the site visit"]);
  });

  it("clearCompletedTasks archives only done tasks", async () => {
    expect(await clearCompletedTasks(CONVO)).toEqual(["t1"]);
    expect(await titles()).toEqual(["Draft the quote", "Book the site visit"]);
    expect(table).toHaveLength(3);
  });

  it("clearAllTasks archives every task; nothing is destroyed", async () => {
    await clearAllTasks(CONVO);
    expect(await titles()).toEqual([]);
    expect(table).toHaveLength(3);
    expect(table.every((r) => r.deleted_at !== null)).toBe(true);
  });

  it("removing an already-archived task is refused, not silently re-stamped", async () => {
    await removeTask("t2");
    const first = table.find((r) => r.id === "t2")?.deleted_at;
    await expect(removeTask("t2")).rejects.toThrow();
    expect(table.find((r) => r.id === "t2")?.deleted_at).toBe(first);
  });
});
