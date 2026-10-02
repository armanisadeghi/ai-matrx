/**
 * A reopened conversation keeps its run history.
 *
 * The initial hydrate seeds run stats (tokens, cost, timing) and the
 * completed-request state the response-feedback bar needs from the
 * conversation's `requests` / `user_requests`, so without them every run read
 * empty after a reload. Since 2026-09-27 `get_cx_conversation_bundle` carries
 * both on an initial load, and then no extra table is read. An RPC body
 * without them still gets the history, read directly (and says so);
 * pagination keeps opting out.
 */

const rpc = jest.fn();
const fromCalls: string[] = [];

function query(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["select", "eq", "is", "in", "order", "lt", "limit"]) {
    chain[m] = jest.fn(self);
  }
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rows, error: null });
  return chain;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    schema: () => ({
      from: (table: string) => {
        fromCalls.push(table);
        if (table === "request") {
          return query([
            { id: "req-1", user_request_id: "ur-1", conversation_id: "conv-1" },
            { id: "req-2", user_request_id: "ur-1", conversation_id: "conv-1" },
          ]);
        }
        if (table === "user_request") {
          return query([{ id: "ur-1", status: "complete" }]);
        }
        return query([]);
      },
    }),
  },
}));

import { fetchConversationBundle } from "../conversation-bundle";

const RPC_BUNDLE = {
  conversation: { id: "conv-1" },
  messages: [],
  tool_calls: [],
  artifacts: [],
  media: [],
  pagination: { limit: 50, returned_count: 0, oldest_position: null, has_more: false },
};

describe("fetchConversationBundle run history", () => {
  beforeEach(() => {
    rpc.mockReset();
    fromCalls.length = 0;
    rpc.mockResolvedValue({ data: RPC_BUNDLE, error: null });
  });

  it("adds the conversation's requests and user requests when the RPC omits them", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const bundle = await fetchConversationBundle("conv-1");
    expect(bundle.requests?.map((r) => r.id)).toEqual(["req-1", "req-2"]);
    expect(bundle.userRequests?.map((r) => r.id)).toEqual(["ur-1"]);
    expect(fromCalls).toEqual(["request", "user_request"]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("returned no run history"),
    );
    warn.mockRestore();
  });

  it("does not read run history for a pagination load", async () => {
    const bundle = await fetchConversationBundle("conv-1", {
      skipObservabilityFallback: true,
    });
    expect(bundle.requests).toBeUndefined();
    expect(fromCalls).toEqual([]);
  });

  it("reads no extra table when the RPC carries run history (its real shape)", async () => {
    rpc.mockResolvedValue({
      data: {
        ...RPC_BUNDLE,
        requests: [{ id: "req-7", user_request_id: "ur-7" }],
        user_requests: [{ id: "ur-7" }],
      },
      error: null,
    });
    const bundle = await fetchConversationBundle("conv-1");
    expect(bundle.requests?.map((r) => r.id)).toEqual(["req-7"]);
    expect(bundle.user_requests?.map((r) => r.id)).toEqual(["ur-7"]);
    expect(fromCalls).toEqual([]);
  });

  it("treats a NULL bundle as a conversation with no row yet — no table reads", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(fetchConversationBundle("conv-1")).rejects.toMatchObject({
      code: "CONVERSATION_NOT_MATERIALIZED",
    });
    expect(fromCalls).toEqual([]);
  });

  it("keeps an RPC that already carries run history as it is", async () => {
    rpc.mockResolvedValue({
      data: { ...RPC_BUNDLE, requests: [], userRequests: [{ id: "ur-9" }] },
      error: null,
    });
    const bundle = await fetchConversationBundle("conv-1");
    expect(bundle.userRequests?.map((r) => r.id)).toEqual(["ur-9"]);
    expect(fromCalls).toEqual([]);
  });
});
