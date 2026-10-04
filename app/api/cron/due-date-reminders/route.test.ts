import { GET } from "./route";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { enqueueDueReminder } from "@/features/tasks/services/dueReminderOutbox";

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
jest.mock("@/features/tasks/services/dueReminderOutbox", () => ({ enqueueDueReminder: jest.fn() }));

const mockedWorkspaceDb = jest.mocked(projectsDb);
const mockedEnqueue = jest.mocked(enqueueDueReminder);

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
    mockedEnqueue.mockResolvedValue("queued");

    const response = await GET({
      headers: { get: (name: string) => name === "Authorization" ? "Bearer test-secret" : null },
    } as Request);

    expect(response.status).toBe(200);
    expect(taskQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
    // One notice per recipient AND organization — no task from org-b rides org-a's notice.
    expect(mockedEnqueue).toHaveBeenCalledTimes(2);
    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.anything(), "recipient", "org-a", ["task-a1", "task-a2"], expect.any(String));
    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.anything(), "recipient", "org-b", ["task-b1"], expect.any(String));
  });

  it("counts replayed daily notices toward the three-notice cap", async () => {
    process.env.CRON_SECRET = "test-secret";
    delete process.env.MATRX_PROFILE;
    jest.mocked(createAdminClient).mockReturnValue({} as ReturnType<typeof createAdminClient>);
    const tasks = ["a", "b", "c", "d"].map((id) => ({
      id, title: `Reminder ${id}`, organization_id: `org-${id}`,
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
    mockedEnqueue.mockResolvedValue("duplicate");

    const response = await GET({
      headers: { get: (name: string) => name === "Authorization" ? "Bearer test-secret" : null },
    } as Request);

    expect(response.status).toBe(200);
    expect(mockedEnqueue.mock.calls.map(([, , org]) => org)).toEqual(["org-a", "org-b", "org-c"]);
    expect((await response.json()).results).toEqual(expect.objectContaining({ duplicates: 3, skipped: 1 }));
  });
});
