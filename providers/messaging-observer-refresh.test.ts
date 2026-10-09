import {
  asConversationId,
  asMessageId,
  asOrganizationId,
  asUserId,
  createMemoryOutboxStorage,
  createMessagingEngine,
  type Message,
  type MessagingRepository,
} from "@ai-matrx/messaging";
import type { RealtimeManager } from "@ai-matrx/realtime";

const conversationId = asConversationId("77777777-7777-4777-8777-777777777777");
const userId = asUserId("22222222-2222-4222-8222-222222222222");
const organizationId = asOrganizationId("44444444-4444-4444-8444-444444444444");

function message(id: string, createdAt: string): Message {
  return {
    id: asMessageId(id),
    conversationId,
    senderId: userId,
    content: id,
    kind: "text",
    createdAt,
    deliveryState: "sent",
    clientMessageId: null,
    organizationId,
    replyToId: null,
    editedAt: null,
    deletedForEveryone: false,
    action: null,
    attachments: [],
    references: [],
    metadata: {},
    softExpiresAt: null,
    deletedAt: null,
  } as Message;
}

describe("messaging observer refresh", () => {
  afterEach(() => jest.useRealTimers());

  it("backfills after the newest loaded message and keeps older loaded history", async () => {
    jest.useFakeTimers();
    const first = message("11111111-1111-4111-8111-111111111111", "2026-10-08T10:00:00.000Z");
    const second = message("22222222-2222-4222-8222-222222222222", "2026-10-08T10:01:00.000Z");
    const since = jest.fn(async (_id: unknown, timestamp: string) => {
      expect(timestamp).toBe(first.createdAt);
      return [second];
    });
    const repository = {
      organizationId: null,
      actingUserId: async () => userId,
      listMessages: async () => ({ items: [first], hasMore: true, nextCursor: null }),
      messagesSince: since,
      markRead: async () => 0,
      getConversationSummary: async () => null,
    } as unknown as MessagingRepository;
    const channel = {
      status: () => "connected",
      close: jest.fn(),
      send: jest.fn(),
      requestBackfill: jest.fn(),
      isLocalLeader: () => true,
      presence: null,
    };
    const manager = { open: () => channel } as unknown as RealtimeManager;
    let active = true;
    const engine = createMessagingEngine({
      repository,
      manager,
      identity: { userId, organizationId: null },
      outboxStorage: createMemoryOutboxStorage(),
      observerRefresh: { intervalMs: 1_000, active: () => active },
    });

    try {
      await engine.openConversation(conversationId);
      active = false;
      await jest.advanceTimersByTimeAsync(1_000);
      expect(since).not.toHaveBeenCalled();

      active = true;
      await jest.advanceTimersByTimeAsync(1_000);

      expect(since).toHaveBeenCalledTimes(1);
      expect(engine.store.snapshot().threads.get(conversationId)?.messages.map((item) => item.id)).toEqual([
        first.id,
        second.id,
      ]);
    } finally {
      engine.dispose();
    }
  });
});
