import { sendDm } from "./system-dm";
import { createAdminClient } from "@/utils/supabase/adminClient";

jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: jest.fn() }));

describe("system DM organization boundary", () => {
  afterEach(() => jest.clearAllMocks());

  it("refuses to insert a message when get-or-create returns another organization's conversation", async () => {
    const insert = jest.fn();
    const conversationQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { organization_id: "other-org" }, error: null,
      }),
    };
    jest.mocked(createAdminClient).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: "conversation-id", error: null }),
      schema: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({ ...conversationQuery, insert }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendDm({
      senderId: null,
      recipientId: "recipient-id",
      organizationId: "task-org",
      content: "A private task title",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("different organization");
    expect(insert).not.toHaveBeenCalled();
  });
});
