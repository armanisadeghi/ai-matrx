import { createConversationBattleForks } from "./forkConversationBattle";

describe("createConversationBattleForks", () => {
  it("creates independently named forks from the same source", async () => {
    const forkConversation = jest
      .fn<Promise<{ conversationId: string }>, [string]>()
      .mockResolvedValueOnce({ conversationId: "conversation-a" })
      .mockResolvedValueOnce({ conversationId: "conversation-b" });
    const ids = ["column-a", "column-b"];
    let nextId = 0;

    const result = await createConversationBattleForks({
      count: 2,
      firstForkNumber: 1,
      sourceTitle: "Original",
      forkConversation,
      createColumnId: () => ids[nextId++] ?? "unexpected-column",
    });

    expect(forkConversation).toHaveBeenNthCalledWith(
      1,
      "Original — Battle fork 1",
    );
    expect(forkConversation).toHaveBeenNthCalledWith(
      2,
      "Original — Battle fork 2",
    );
    expect(result).toEqual({
      created: [
        {
          columnId: "column-a",
          conversationId: "conversation-a",
          label: "Fork 1",
        },
        {
          columnId: "column-b",
          conversationId: "conversation-b",
          label: "Fork 2",
        },
      ],
      failures: [],
    });
  });

  it("keeps successful forks when one contender fails", async () => {
    const failure = new Error("fork unavailable");
    const forkConversation = jest
      .fn<Promise<{ conversationId: string }>, [string]>()
      .mockResolvedValueOnce({ conversationId: "conversation-a" })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ conversationId: "conversation-c" });

    const result = await createConversationBattleForks({
      count: 3,
      firstForkNumber: 4,
      sourceTitle: "Original",
      forkConversation,
      createColumnId: () => "column",
    });

    expect(result.created.map((fork) => fork.label)).toEqual([
      "Fork 4",
      "Fork 6",
    ]);
    expect(result.failures).toEqual([failure]);
  });

  it("retains a durable fork that needs hydration recovery", async () => {
    const result = await createConversationBattleForks({
      count: 1,
      firstForkNumber: 1,
      sourceTitle: "Original",
      forkConversation: async () => ({
        conversationId: "durable-fork",
        loadError: "Bundle temporarily unavailable",
      }),
      createColumnId: () => "column-a",
    });

    expect(result.failures).toEqual([]);
    expect(result.created[0]).toEqual({
      columnId: "column-a",
      conversationId: "durable-fork",
      label: "Fork 1",
      loadError: "Bundle temporarily unavailable",
    });
  });
});
