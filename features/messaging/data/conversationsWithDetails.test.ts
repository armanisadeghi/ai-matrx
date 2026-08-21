import {
  fetchConversationsWithDetails,
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
