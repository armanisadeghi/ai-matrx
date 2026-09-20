const rpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc } }));

import { readAssociationPages } from "../readAssociationPages";

function rows(count: number, start = 0) {
  return Array.from({ length: count }, (_, index) => ({ id: `edge-${start + index}` }));
}

function pagedRpc(total: number, failFrom?: number) {
  return jest.fn((..._args: unknown[]) => {
    interface Query {
      order(column: string, options?: { ascending: boolean; nullsFirst?: boolean }): Query;
      range(from: number, to: number): Promise<{ data: { id: string }[] | null; error: { message: string } | null; count: number }>;
    }
    const query: Query = {
      order: jest.fn(() => query),
      range: jest.fn(async (from: number, to: number) => {
        if (failFrom !== undefined && from >= failFrom) {
          return { data: null, error: { message: "second page failed" }, count: total };
        }
        const available = Math.max(0, Math.min(to + 1, total) - from);
        return { data: rows(available, from), error: null, count: total };
      }),
    };
    return query;
  });
}

beforeEach(() => jest.clearAllMocks());

describe("readAssociationPages", () => {
  it("returns all 1001 RPC edges instead of the server's first 1000-row page", async () => {
    rpc.mockImplementation(pagedRpc(1001));

    const result = await readAssociationPages("assoc_for_entity", {
      p_type: "note",
      p_id: "guide-1",
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1001);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "assoc_for_entity", { p_type: "note", p_id: "guide-1" }, { count: "exact" });
  });

  it("fails loudly when a later RPC page fails instead of returning a partial edge list", async () => {
    rpc.mockImplementation(pagedRpc(1001, 1000));

    await expect(readAssociationPages("assoc_for_entity", {
      p_type: "note",
      p_id: "guide-1",
    })).rejects.toMatchObject({ message: "second page failed" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

 it("preserves structured schema errors for the association package classifier", async () => {
    const error = { code: "PGRST202", message: "Missing RPC", hint: "Refresh schema cache" };
    const query = { order: jest.fn(), range: jest.fn(async () => ({ data: null, error, count: null })) };
    query.order.mockReturnValue(query);
    rpc.mockReturnValue(query);
    await expect(readAssociationPages("assoc_for_entity", { p_type: "note", p_id: "guide-1" })).rejects.toBe(error);
    expect(query.order.mock.calls).toEqual([
      ["position", { ascending: true, nullsFirst: false }],
      ["created_at", { ascending: true }],
      ["id"],
    ]);
  });
