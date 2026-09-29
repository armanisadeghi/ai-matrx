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

  it("treats only the assignment replay index conflict as the existing message", async () => {
    const insert = jest.fn()
      .mockResolvedValueOnce({ error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "dm_task_assignment_client_message_id_uidx"',
      } })
      .mockResolvedValueOnce({ error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "some_other_constraint"',
      } });
    const conversationQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { organization_id: "task-org" }, error: null,
      }),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          conversation_id: "conversation-id",
          organization_id: "task-org",
          sender_id: "sender-id",
          content: "Review the contract",
          action_data: null,
        }, error: null,
      }),
    };
    jest.mocked(createAdminClient).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: "conversation-id", error: null }),
      schema: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({ ...conversationQuery, insert }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);
    const options = {
      senderId: "sender-id",
      recipientId: "recipient-id",
      organizationId: "task-org",
      content: "Review the contract",
      clientMessageId: "task.assigned:task-id:4:dm",
    };

    expect(await sendDm(options)).toMatchObject({ ok: true });
    expect(await sendDm(options)).toMatchObject({ ok: false });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      client_message_id: options.clientMessageId,
    }));

    insert.mockResolvedValue({ error: {
      code: "23505",
      message: 'duplicate key value violates unique constraint "dm_task_assignment_client_message_id_uidx"',
    } });
    conversationQuery.maybeSingle.mockResolvedValue({
      data: {
        conversation_id: "another-conversation",
        organization_id: "other-org",
        sender_id: "sender-id",
        content: "Review the contract",
        action_data: null,
      }, error: null,
    });
    expect(await sendDm(options)).toMatchObject({
      ok: false, error: "Assignment DM key belongs to a different message",
    });
  });
});
