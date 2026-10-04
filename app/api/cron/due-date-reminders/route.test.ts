import { GET } from "./route";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { enqueueDueReminderEmail } from "@/features/tasks/services/dueReminderOutbox";
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
jest.mock("@/utils/supabase/projectsDb", () => ({ projectsDb: jest.fn() }));
jest.mock("@/features/tasks/services/dueReminderOutbox", () => ({ enqueueDueReminderEmail: jest.fn() }));
jest.mock("@/lib/services/system-dm", () => ({ sendDm: jest.fn() }));

const mockedWorkspaceDb = jest.mocked(projectsDb);
const mockedSendDm = jest.mocked(sendDm);
const mockedEnqueueEmail = jest.mocked(enqueueDueReminderEmail);

describe("due-date reminders organization boundary", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalProfile = process.env.MATRX_PROFILE;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.MATRX_PROFILE = originalProfile;
    jest.clearAllMocks();
  });

  it("keeps one user's reminder intents and digests inside each organization", async () => {
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
    } as unknown as ReturnType<typeof projectsDb>);
    mockedEnqueueEmail.mockResolvedValue("queued");
    mockedSendDm.mockResolvedValue({ ok: true });

    const response = await GET({
      headers: { get: (name: string) => name === "Authorization" ? "Bearer test-secret" : null },
    } as Request);

    expect(response.status).toBe(200);
    expect(mockedEnqueueEmail).toHaveBeenCalledTimes(3);
    expect(mockedEnqueueEmail).toHaveBeenCalledWith(expect.anything(), "task-b1", expect.any(String));
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

  it("counts replayed daily intents toward the three-email cap", async () => {
    process.env.CRON_SECRET = "test-secret";
    delete process.env.MATRX_PROFILE;
    jest.mocked(createAdminClient).mockReturnValue({} as ReturnType<typeof createAdminClient>);
    const tasks = ["a", "b", "c", "d"].map((id) => ({
      id, title: `Reminder ${id}`, organization_id: "admin-workspace",
      due_date: new Date().toISOString(), assignee_id: "admin", created_by: "admin",
    }));
    const taskQuery = {
      select: jest.fn().mockReturnThis(), is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: tasks, error: null }),
    };
    const muteQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockedWorkspaceDb.mockReturnValue({
      from: jest.fn((table: string) => table === "tasks" ? taskQuery : muteQuery),
    } as unknown as ReturnType<typeof projectsDb>);
    mockedEnqueueEmail.mockResolvedValue("duplicate");
    mockedSendDm.mockResolvedValue({ ok: true });

    const response = await GET({
      headers: { get: (name: string) => name === "Authorization" ? "Bearer test-secret" : null },
    } as Request);

    expect(response.status).toBe(200);
    expect(mockedEnqueueEmail.mock.calls.map(([, id]) => id)).toEqual(["a", "b", "c"]);
    expect((await response.json()).results).toEqual(expect.objectContaining({ duplicates: 3, skipped: 1 }));
  });
});
