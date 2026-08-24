import {
  fetchConversationsWithDetails,
  fetchMoreConversationsWithDetails,
  nextConversationsCursor,
  resetConversationsWithDetailsCache,
} from "@/features/messaging/data/conversationsWithDetails";

type Client = Parameters<typeof fetchConversationsWithDetails>[0];

function clientReturning(rows: unknown[], onCall: () => void): Client {
  return {
    rpc: async () => {
      onCall();
      // Yield so concurrent callers all land while the request is in flight.
      await Promise.resolve();
      return { data: rows, error: null };
    },
  } as unknown as Client;
}

describe("fetchConversationsWithDetails", () => {
  beforeEach(() => {
    resetConversationsWithDetailsCache();
  });

  it("collapses concurrent callers into ONE request", async () => {
    let calls = 0;
    const client = clientReturning([{ conversation_id: "c1" }], () => {
      calls += 1;
    });

    const results = await Promise.all(
      Array.from({ length: 250 }, () =>
        fetchConversationsWithDetails(client, "user-1", { maxAgeMs: 0 }),
      ),
    );

    expect(calls).toBe(1);
    expect(results).toHaveLength(250);
    expect(results[0]).toEqual([{ conversation_id: "c1" }]);
  });

  it("reuses a settled response inside the TTL and refetches outside it", async () => {
    let calls = 0;
    const client = clientReturning([], () => {
      calls += 1;
    });

    await fetchConversationsWithDetails(client, "user-1");
    await fetchConversationsWithDetails(client, "user-1");
    expect(calls).toBe(1);

    // A caller that must observe a just-written row never reads the cache.
    await fetchConversationsWithDetails(client, "user-1", { maxAgeMs: 0 });
    expect(calls).toBe(2);
  });

  it("caches per user", async () => {
    let calls = 0;
    const client = clientReturning([], () => {
      calls += 1;
    });

    await fetchConversationsWithDetails(client, "user-1");
    await fetchConversationsWithDetails(client, "user-2");
    expect(calls).toBe(2);
  });

  it("rejects on RPC error and does not poison the next call", async () => {
    let calls = 0;
    const client = {
      rpc: async () => {
        calls += 1;
        if (calls === 1) return { data: null, error: { message: "boom" } };
        return { data: [], error: null };
      },
    } as unknown as Client;

    await expect(
      fetchConversationsWithDetails(client, "user-1"),
    ).rejects.toMatchObject({ message: "boom" });

    await expect(
      fetchConversationsWithDetails(client, "user-1"),
    ).resolves.toEqual([]);
    expect(calls).toBe(2);
  });
});

describe("nextConversationsCursor (D247 pagination)", () => {
  it("returns null when the page is shorter than the page size (no more rows)", () => {
    const rows = [
      { conversation_id: "c1", last_message_at: "2026-01-01T00:00:00Z" },
    ] as never;
    expect(nextConversationsCursor(rows, 50)).toBeNull();
  });

  it("builds a cursor from the last row when the page is full", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      conversation_id: `c${i}`,
      last_message_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      conversation_updated_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    })) as never[];
    const cursor = nextConversationsCursor(rows, 50);
    expect(cursor).toEqual({
      beforeSortAt: "2026-01-50T00:00:00Z",
      beforeConversationId: "c49",
    });
  });

  it("falls back to conversation_updated_at when the last row has no last message", () => {
    const rows = Array.from({ length: 2 }, (_, i) => ({
      conversation_id: `c${i}`,
      last_message_at: null,
      conversation_updated_at: "2026-02-01T00:00:00Z",
    })) as never[];
    const cursor = nextConversationsCursor(rows, 2);
    expect(cursor).toEqual({
      beforeSortAt: "2026-02-01T00:00:00Z",
      beforeConversationId: "c1",
    });
  });
});

describe("fetchMoreConversationsWithDetails", () => {
  it("passes the cursor and page size through to the RPC, uncached", async () => {
    let calls = 0;
    let capturedArgs: unknown;
    const client = {
      rpc: async (_name: string, args: unknown) => {
        calls += 1;
        capturedArgs = args;
        return { data: [{ conversation_id: "c2" }], error: null };
      },
    } as unknown as Client;

    const rows = await fetchMoreConversationsWithDetails(client, "user-1", {
      beforeSortAt: "2026-01-01T00:00:00Z",
      beforeConversationId: "c1",
    });

    expect(calls).toBe(1);
    expect(capturedArgs).toEqual({
      p_user_id: "user-1",
      p_limit: 50,
      p_before_sort_at: "2026-01-01T00:00:00Z",
      p_before_conversation_id: "c1",
    });
    expect(rows).toEqual([{ conversation_id: "c2" }]);

    // A second call for the same user is NOT deduped/cached — pagination is
    // a one-shot, user-driven action.
    await fetchMoreConversationsWithDetails(client, "user-1", {
      beforeSortAt: "2026-01-01T00:00:00Z",
      beforeConversationId: "c1",
    });
    expect(calls).toBe(2);
  });
});
