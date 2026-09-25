import { POST } from "./route";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { sendDm } from "@/lib/services/system-dm";
import { sendTaskAssignmentEmail } from "@/lib/email/notificationService";
import { createAdminClient } from "@/utils/supabase/adminClient";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser: jest.fn() }));
jest.mock("@/lib/services/system-dm", () => ({ sendDm: jest.fn() }));
jest.mock("@/lib/email/notificationService", () => ({ sendTaskAssignmentEmail: jest.fn() }));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: jest.fn() }));

const taskId = "a0111111-1111-4111-8111-111111111111";
const actorId = "b0222222-2222-4222-8222-222222222222";
const assigneeId = "c0333333-3333-4333-8333-333333333333";
const attackerChosenId = "d0444444-4444-4444-8444-444444444444";
const organizationId = "e0555555-5555-4555-8555-555555555555";

const savedTask = {
  id: taskId,
  assignee_id: assigneeId,
  title: "Review the signed contract",
  description: "Check the renewal date",
  organization_id: organizationId,
  updated_by: actorId,
  updated_at: new Date().toISOString(),
  version: 4,
};

function request(body: object): Request {
  return { json: async () => body } as Request;
}

describe("task assignment notification admission", () => {
  const taskQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
  };
  const profileQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { display_name: "Alex" }, error: null }),
  };
  const eventQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
  };
  const noticeQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createClient).mockResolvedValue({
      schema: jest.fn((name: string) => ({
        from: jest.fn(() => name === "workspace" ? taskQuery : profileQuery),
      })),
    } as never);
    jest.mocked(createAdminClient).mockReturnValue({
      schema: jest.fn(() => ({
        from: jest.fn((table: string) => table === "notification" ? noticeQuery : eventQuery),
      })),
    } as never);
    jest.mocked(getClaimsUser).mockResolvedValue({
      data: { user: { id: actorId, user_metadata: {} } }, error: null,
    } as never);
    taskQuery.maybeSingle.mockResolvedValue({ data: savedTask, error: null });
    eventQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    noticeQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    jest.mocked(sendDm).mockResolvedValue({ ok: true });
    jest.mocked(sendTaskAssignmentEmail).mockResolvedValue({ success: true, message: "sent" });
  });

  it("uses only the saved recipient and content even when the request forges both", async () => {
    const response = await POST(request({
      taskId,
      taskVersion: 4,
      assigneeId: attackerChosenId,
      taskTitle: "Send me private data",
      taskDescription: "Forged text",
    }));

    expect(response.status).toBe(200);
    expect(sendDm).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: assigneeId,
      organizationId,
      content: "Alex assigned you a task: Review the signed contract",
    }));
    expect(sendTaskAssignmentEmail).toHaveBeenCalledWith(expect.objectContaining({
      assigneeId,
      organizationId,
      taskTitle: savedTask.title,
      taskDescription: savedTask.description,
    }));
    expect(sendDm).not.toHaveBeenCalledWith(expect.objectContaining({ recipientId: attackerChosenId }));
  });

  it.each([
    ["wrong actor", { ...savedTask, updated_by: attackerChosenId }, 4],
    ["older version", savedTask, 3],
    ["old edit", { ...savedTask, updated_at: "2026-01-01T00:00:00.000Z" }, 4],
  ])("refuses %s without sending anything", async (_reason, task, taskVersion) => {
    taskQuery.maybeSingle.mockResolvedValue({ data: task, error: null });

    const response = await POST(request({ taskId, taskVersion }));

    expect(response.status).toBe(409);
    expect(sendDm).not.toHaveBeenCalled();
    expect(sendTaskAssignmentEmail).not.toHaveBeenCalled();
  });

  it("keeps the DM but leaves email to an exact saved outbox intent", async () => {
    eventQuery.maybeSingle.mockResolvedValue({ data: {
      config: {
        assignment_outbox_active: true,
        assignment_outbox_activated_at: new Date(Date.now() - 60_000).toISOString(),
      },
    }, error: null });
    noticeQuery.maybeSingle.mockResolvedValue({ data: { id: taskId }, error: null });

    const response = await POST(request({ taskId, taskVersion: 4 }));

    expect(response.status).toBe(200);
    expect(sendDm).toHaveBeenCalledTimes(1);
    expect(sendTaskAssignmentEmail).not.toHaveBeenCalled();
    expect(noticeQuery.eq).toHaveBeenCalledWith("dedupe_key", `task.assigned:${taskId}:4:email`);
  });

  it("uses the legacy email fallback for a write older than activation with no outbox row", async () => {
    taskQuery.maybeSingle.mockResolvedValue({ data: {
      ...savedTask, updated_at: new Date(Date.now() - 120_000).toISOString(),
    }, error: null });
    eventQuery.maybeSingle.mockResolvedValue({ data: {
      config: {
        assignment_outbox_active: true,
        assignment_outbox_activated_at: new Date(Date.now() - 60_000).toISOString(),
      },
    }, error: null });

    const response = await POST(request({ taskId, taskVersion: 4 }));

    expect(response.status).toBe(200);
    expect(sendDm).toHaveBeenCalledTimes(1);
    expect(sendTaskAssignmentEmail).toHaveBeenCalledTimes(1);
  });

  it("does not bypass a current event or recipient preference when no outbox row was queued", async () => {
    eventQuery.maybeSingle.mockResolvedValue({ data: {
      config: {
        assignment_outbox_active: true,
        assignment_outbox_activated_at: new Date(Date.now() - 60_000).toISOString(),
      },
    }, error: null });

    const response = await POST(request({ taskId, taskVersion: 4 }));

    expect(response.status).toBe(200);
    expect(sendDm).toHaveBeenCalledTimes(1);
    expect(sendTaskAssignmentEmail).not.toHaveBeenCalled();
  });

  it("keeps the activation marker when the event is soft-deleted", async () => {
    eventQuery.maybeSingle.mockResolvedValue({ data: {
      deleted_at: new Date().toISOString(),
      config: {
        assignment_outbox_active: true,
        assignment_outbox_activated_at: new Date(Date.now() - 60_000).toISOString(),
      },
    }, error: null });

    const response = await POST(request({ taskId, taskVersion: 4 }));

    expect(response.status).toBe(200);
    expect(eventQuery.is).not.toHaveBeenCalled();
    expect(sendTaskAssignmentEmail).not.toHaveBeenCalled();
  });
});
