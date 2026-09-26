/**
 * A reopened conversation keeps its run history.
 *
 * The `get_cx_conversation_bundle` RPC returns messages, tool calls and media
 * but no `requests` / `user_requests`. The initial hydrate seeds run stats
 * (tokens, cost, timing) and the completed-request state the response-feedback
 * bar needs from exactly those rows, so without them every run read empty
 * after a reload. `fetchConversationBundle` now reads the history itself on
 * an initial load; pagination keeps opting out.
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
    const bundle = await fetchConversationBundle("conv-1");
    expect(bundle.requests?.map((r) => r.id)).toEqual(["req-1", "req-2"]);
    expect(bundle.userRequests?.map((r) => r.id)).toEqual(["ur-1"]);
    expect(fromCalls).toEqual(["request", "user_request"]);
  });

  it("does not read run history for a pagination load", async () => {
    const bundle = await fetchConversationBundle("conv-1", {
      skipObservabilityFallback: true,
    });
    expect(bundle.requests).toBeUndefined();
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
