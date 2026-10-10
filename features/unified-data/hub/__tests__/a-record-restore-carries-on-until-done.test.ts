// A BIG UNDO CARRIES ON UNTIL THE STORE SAYS DONE (lane DATA-DEFECTS-4, 2026-10-10).
//
// Harborview Mobile Mechanic archives its 3,000-row "Service jobs" table and presses Undo.
// `custom.record_restore` now answers like the archive door: { done, remaining, restored }, and
// `restoreRecordIn` calls it again while `done` is false. The answers below are what the door
// returned on production for a 3,000-row table (admin@admin.com, rolled-back transaction).
//
// Breaks this catches: stopping after one pass (rows silently left archived); looping forever on a
// store that stops moving; an old store that answers nothing being read as "not done".

import type { RecordsDataSource } from "@ai-matrx/records";

import { restoreRecordIn } from "../doors";

const ORG = "6f0c4b1a-93a4-4a52-9e1b-7c2a1d3e5f60";
const TABLE = "a1b2c3d4-0000-4000-8000-000000000042";

function store(answers: Array<{ data?: unknown; error?: { code: string; message: string } }>) {
  const calls: string[] = [];
  const source = {
    rpc(fn: string) {
      calls.push(fn);
      const next = answers.shift();
      if (!next) throw new Error("unexpected extra call to " + fn);
      return Promise.resolve({ data: next.data ?? null, error: next.error ?? null });
    },
  } as unknown as RecordsDataSource;
  return { source, calls };
}

describe("restoreRecordIn", () => {
  it("calls the door again while it says done is false, and reports each pass", async () => {
    const { source, calls } = store([
      { data: { done: false, remaining: 1800, restored: 1200 } },
      { data: { done: false, remaining: 600, restored: 1200 } },
      { data: { done: true, remaining: 0, restored: 600 } },
    ]);
    const seen: number[] = [];
    const out = await restoreRecordIn(source, ORG, TABLE, { onPass: (p) => seen.push(p.remaining ?? -1) });
    expect(out.ok).toBe(true);
    expect(calls).toEqual(["record_restore", "record_restore", "record_restore"]);
    expect(seen).toEqual([1800, 600]);
  });

  it("reads an old store that answers nothing as done", async () => {
    const { source, calls } = store([{ data: null }]);
    const out = await restoreRecordIn(source, ORG, TABLE);
    expect(out).toEqual({ ok: true, data: null });
    expect(calls).toHaveLength(1);
  });

  it("stops on a store that stops moving and says how many are still archived", async () => {
    const stuck = { data: { done: false, remaining: 40, restored: 0 } };
    const { source } = store([stuck, stuck, stuck, stuck]);
    const out = await restoreRecordIn(source, ORG, TABLE);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.message).toContain("40 records are still archived");
  });
});
