import { POST } from "./route";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { sendDm } from "@/lib/services/system-dm";
import { sendTaskAssignmentEmail } from "@/lib/email/notificationService";

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

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createClient).mockResolvedValue({
      schema: jest.fn((name: string) => ({
        from: jest.fn(() => name === "workspace" ? taskQuery : profileQuery),
      })),
    } as never);
    jest.mocked(getClaimsUser).mockResolvedValue({
      data: { user: { id: actorId, user_metadata: {} } }, error: null,
    } as never);
    taskQuery.maybeSingle.mockResolvedValue({ data: savedTask, error: null });
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
});
