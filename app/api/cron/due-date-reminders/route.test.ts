import { GET } from "./route";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { sendDueDateReminderEmail } from "@/lib/email/notificationService";
import { sendDm } from "@/lib/services/system-dm";

jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: jest.fn() }));
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));
jest.mock("@/utils/supabase/workspaceDb", () => ({ workspaceDb: jest.fn() }));
jest.mock("@/lib/email/notificationService", () => ({ sendDueDateReminderEmail: jest.fn() }));
jest.mock("@/lib/services/system-dm", () => ({ sendDm: jest.fn() }));

const mockedWorkspaceDb = jest.mocked(workspaceDb);
const mockedSendDm = jest.mocked(sendDm);
const mockedSendEmail = jest.mocked(sendDueDateReminderEmail);

describe("due-date reminders organization boundary", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalProfile = process.env.MATRX_PROFILE;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.MATRX_PROFILE = originalProfile;
    jest.clearAllMocks();
  });

  it("sends separate digests and organization-bound emails for one user across organizations", async () => {
    process.env.CRON_SECRET = "test-secret";
    delete process.env.MATRX_PROFILE;
    jest.mocked(createAdminClient).mockReturnValue({} as ReturnType<typeof createAdminClient>);
    const dueDate = new Date().toISOString();
    const tasks = [
      { id: "task-a1", title: "Private Alpha", organization_id: "org-a" },
      { id: "task-b1", title: "Private Beta", organization_id: "org-b" },
      { id: "task-a2", title: "Private Gamma", organization_id: "org-a" },
    ].map((task) => ({
      ...task,
      due_date: dueDate,
      assignee_id: "recipient",
      created_by: "creator",
    }));
    const taskQuery = {
      select: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: tasks, error: null }),
    };
    const muteQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockedWorkspaceDb.mockReturnValue({
      from: jest.fn((table: string) => table === "tasks" ? taskQuery : muteQuery),
    } as unknown as ReturnType<typeof workspaceDb>);
    mockedSendEmail.mockResolvedValue({ success: true, message: "sent" });
    mockedSendDm.mockResolvedValue({ ok: true });

    const response = await GET({
      headers: { get: (name: string) => name === "Authorization" ? "Bearer test-secret" : null },
    } as Request);

    expect(response.status).toBe(200);
    expect(mockedSendEmail).toHaveBeenCalledTimes(3);
    expect(mockedSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-b1", organizationId: "org-b",
    }));
    expect(mockedSendDm).toHaveBeenCalledTimes(2);
    const messages = mockedSendDm.mock.calls.map(([options]) => options);
    const alpha = messages.find((message) => message.organizationId === "org-a");
    const beta = messages.find((message) => message.organizationId === "org-b");
    expect(alpha?.content).toContain("Private Alpha");
    expect(alpha?.content).toContain("Private Gamma");
    expect(alpha?.content).not.toContain("Private Beta");
    expect(beta?.content).toContain("Private Beta");
    expect(beta?.content).not.toContain("Private Alpha");
  });
});
