import type { DmConversationRpcRow } from "@/features/messaging/data/conversation-list";
import {
  parseConversationParticipants,
  toConversationWithDetails,
} from "@/features/messaging/data/conversation-list";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";

const row: DmConversationRpcRow = {
  conversation_created_at: "2026-08-21T00:00:00Z",
  conversation_id: CONVERSATION_ID,
  conversation_type: "direct",
  conversation_updated_at: "2026-08-21T00:01:00Z",
  group_image_url: "",
  group_name: "",
  last_message_at: "2026-08-21T00:01:00Z",
  last_message_content: "hello",
  last_message_sender_id: OTHER_ID,
  participants: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      conversation_id: CONVERSATION_ID,
      user_id: USER_ID,
      role: "member",
      joined_at: null,
      last_read_at: null,
      is_muted: false,
      is_archived: false,
      user: {
        user_id: USER_ID,
        email: "me@example.com",
        display_name: "Me",
        avatar_url: null,
      },
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      conversation_id: CONVERSATION_ID,
      user_id: OTHER_ID,
      role: "owner",
      joined_at: null,
      last_read_at: null,
      is_muted: false,
      is_archived: false,
      user: {
        user_id: OTHER_ID,
        email: "other@example.com",
        display_name: "Other person",
        avatar_url: "https://example.com/avatar.png",
      },
    },
  ],
  unread_count: 1,
};

describe("DM conversation list projection", () => {
  it("builds the complete UI row from one RPC payload", () => {
    const conversation = toConversationWithDetails(row, USER_ID);

    expect(conversation.participants).toHaveLength(2);
    expect(conversation.display_name).toBe("Other person");
    expect(conversation.display_image).toBe("https://example.com/avatar.png");
    expect(conversation.last_message?.content).toBe("hello");
  });

  it("rejects a malformed participant aggregate at the ingress boundary", () => {
    expect(() =>
      parseConversationParticipants([{ user_id: "not-a-uuid" }]),
    ).toThrow();
  });
});
