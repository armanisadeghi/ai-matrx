import { enqueueDueReminder } from "./dueReminderOutbox";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { legacyEmailOptOut, notifyFromSql } from "@/lib/notifications/notifyFromSql";
import type { createAdminClient } from "@/utils/supabase/adminClient";

jest.mock("server-only", () => ({}));
jest.mock("@/utils/supabase/projectsDb", () => ({ projectsDb: jest.fn() }));
jest.mock("@/lib/notifications/notifyFromSql", () => ({
  notifyFromSql: jest.fn(),
  legacyEmailOptOut: jest.fn(),
}));

const recipient = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com
const organization = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const taskId = "70916e58-0307-4e72-bb74-82c3eee3a2e7";
const otherTaskId = "0b0d6a0e-6f43-4d6f-9d55-1f5b8a4f7c21";
const day = "2026-10-04";
const key = `task.due_reminder:${recipient}:${organization}:${day}`;

function query(data: unknown) {
  const q = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(), neq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(), like: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    order: jest.fn(),
  };
  return q;
}

const openTask = (id: string, title: string, due: string) => ({
  id, title, created_by: recipient, assignee_id: null, organization_id: organization,
  due_date: due, status: "planned",
});

describe("due-date notice through the spine", () => {
  const tasks = query(null);
  const mutes = query(null);
  const event = query({ enabled: true, default_channels: { email: true } });
  const override = query(null);
  const notification = query(null);
  const rpc = jest.fn();
  const admin = {
    schema: jest.fn(() => ({
      from: jest.fn((table: string) => {
        if (table === "notification_event_type") return event;
        if (table === "notification_event_override") return override;
        return notification;
      }),
      rpc,
    })),
  } as unknown as ReturnType<typeof createAdminClient>;
  let taskRows: unknown[] = [];
  let muteRows: unknown[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    taskRows = [openTask(taskId, "Review the monthly report", "2026-09-30")];
    muteRows = [];
    let orders = 0;
    // `.order(due_date).order(id)`: the first returns the builder, the second resolves.
    tasks.order.mockReset().mockImplementation(() => (++orders % 2
      ? tasks : Promise.resolve({ data: taskRows, error: null })));
    mutes.eq.mockImplementation(() => Promise.resolve({ data: muteRows, error: null }));
    jest.mocked(projectsDb).mockReturnValue({
      from: jest.fn((table: string) => table === "tasks" ? tasks : mutes),
    } as unknown as ReturnType<typeof projectsDb>);
    event.maybeSingle.mockResolvedValue({ data: { enabled: true, default_channels: { email: true } }, error: null });
    override.maybeSingle.mockResolvedValue({ data: null, error: null });
    notification.limit.mockResolvedValue({ data: [], error: null });
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "notification_user_channels" ? { email: true, dm: true } :
        [{ address: "admin@admin.com", refusal: null }], error: null,
    }));
    jest.mocked(legacyEmailOptOut).mockResolvedValue([]);
    jest.mocked(notifyFromSql).mockResolvedValue({
      queued: ["dm", "email"], skipped: [], say: "An email is on its way to them.",
    });
  });

  it("queues one task as task.due_reminder with its task chip, pairing left to the spine", async () => {
    expect(await enqueueDueReminder(admin, recipient, organization, [taskId], day)).toBe("queued");
    expect(notifyFromSql).toHaveBeenCalledWith(admin, expect.objectContaining({
      organizationId: organization, eventKey: "task.due_reminder", recipientUserId: recipient,
      toAddress: "admin@admin.com", dedupeKey: key, targetKind: "task", targetId: taskId,
      deepLink: `/tasks?task=${taskId}`, optedOut: [],
      payload: { task: { title: "Review the monthly report", due: "2026-09-30",
        urgency_label: "Overdue", urgency_words: "overdue" } },
      dm: { action_data: { kind: "task_reminder", payload: {
        task_id: taskId, title: "Review the monthly report", due_date: "2026-09-30" } } },
    }));
  });

  it("queues several tasks as one task.due_reminder_digest", async () => {
    taskRows = [openTask(taskId, "Alpha", "2026-10-04"), openTask(otherTaskId, "Beta", "2026-10-05")];
    expect(await enqueueDueReminder(admin, recipient, organization, [taskId, otherTaskId], day))
      .toBe("queued");
    const args = jest.mocked(notifyFromSql).mock.calls[0][1];
    expect(args.eventKey).toBe("task.due_reminder_digest");
    expect(args.dedupeKey).toBe(key);
    expect(args.payload).toEqual({ digest: { count: "2", lines:
      "You have 2 tasks needing attention:\n• Alpha (due today)\n• Beta (due tomorrow)" } });
    expect(args.dm?.action_data).toEqual({ kind: "open_link", payload: { href: "/tasks", label: "Open tasks" } });
  });

  it("treats an email already sent today, in any earlier key format, as the day's notice", async () => {
    notification.limit.mockResolvedValue({ data: [{ id: "earlier" }], error: null });
    expect(await enqueueDueReminder(admin, recipient, organization, [taskId], day)).toBe("duplicate");
    expect(notification.like).toHaveBeenCalledWith("dedupe_key", `task.due_reminder:%${day}:email%`);
    expect(notifyFromSql).not.toHaveBeenCalled();
  });

  it("reports a spine replay as duplicate", async () => {
    jest.mocked(notifyFromSql).mockResolvedValue({ queued: [], say: "",
      skipped: [{ channel: "dm", why: "already_queued" }, { channel: "email", why: "already_queued" }] });
    expect(await enqueueDueReminder(admin, recipient, organization, [taskId], day)).toBe("duplicate");
  });

  it("passes the person's email switch as opted_out so the DM still goes", async () => {
    jest.mocked(legacyEmailOptOut).mockResolvedValue(["email"]);
    await enqueueDueReminder(admin, recipient, organization, [taskId], day);
    expect(jest.mocked(notifyFromSql).mock.calls[0][1].optedOut).toEqual(["email"]);
  });

  it("passes a DM turned off, so the spine withholds the email with it", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "notification_user_channels" ? { email: false, dm: false } :
        [{ address: "admin@admin.com", refusal: null }], error: null,
    }));
    await enqueueDueReminder(admin, recipient, organization, [taskId], day);
    expect(jest.mocked(notifyFromSql).mock.calls[0][1].optedOut?.sort()).toEqual(["dm", "email"]);
  });

  it("never notifies for a snoozed task or a task in another organization", async () => {
    muteRows = [{ task_id: taskId, snoozed_until: "2999-01-01T00:00:00Z", dismissed_at: null }];
    expect(await enqueueDueReminder(admin, recipient, organization, [taskId], day)).toBe("skipped");
    muteRows = [];
    taskRows = [{ ...openTask(taskId, "Elsewhere", "2026-10-04"), organization_id: "another-org" }];
    expect(await enqueueDueReminder(admin, recipient, organization, [taskId], day)).toBe("skipped");
    expect(notifyFromSql).not.toHaveBeenCalled();
  });
});
