/**
 * "Counting your items failed: statement timeout" on every reload of the Source input (2026-09-30).
 * One slow kind (Files: every top-level file on the platform checked one call per row) took the
 * whole count read down, because every kind of a short list went in ONE call and a statement
 * timeout cancels the whole call. A short list is now counted one kind per call: a kind that cannot
 * be counted comes back `null` (a dash), and every other kind still answers.
 */

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { fetchKindCounts } from "../kindInventory";

const TOKENS = ["file", "transcript", "dataset", "structured_list", "workbook", "note"];

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (_fn: string, args: { p_tokens: string[] }) => {
    if (args.p_tokens.includes("file")) {
      return { data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } };
    }
    return { data: args.p_tokens.map((token, i) => ({ token, n: i + 3 })), error: null };
  });
});

describe("fetchKindCounts with one kind that times out", () => {
  it("still counts every other kind and leaves only the slow one uncounted", async () => {
    const counts = await fetchKindCounts({ kind: "all" }, TOKENS);
    expect(counts.get("file")).toBeNull();
    for (const t of TOKENS.filter((t) => t !== "file")) expect(typeof counts.get(t)).toBe("number");
  });

  it("asks for each kind of a short list on its own", async () => {
    await fetchKindCounts({ kind: "all" }, TOKENS);
    expect(rpc).toHaveBeenCalledTimes(TOKENS.length);
    for (const call of rpc.mock.calls) expect(call[1].p_tokens).toHaveLength(1);
  });
});
