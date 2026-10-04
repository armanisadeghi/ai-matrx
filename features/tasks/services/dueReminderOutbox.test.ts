import { enqueueDueReminderEmail } from "./dueReminderOutbox";
import { projectsDb } from "@/utils/supabase/projectsDb";
import type { createAdminClient } from "@/utils/supabase/adminClient";

jest.mock("server-only", () => ({}));
jest.mock("@/utils/supabase/projectsDb", () => ({ projectsDb: jest.fn() }));

const recipient = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com
const organization = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const taskId = "70916e58-0307-4e72-bb74-82c3eee3a2e7";
const day = "2026-10-04";

function query(data: unknown) {
  return {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(), neq: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    insert: jest.fn().mockResolvedValue({ error: null }),
  };
}

describe("saved due-date email intent", () => {
  const task = query({ id: taskId, title: "Review the monthly report",
    created_by: recipient, assignee_id: null, organization_id: organization,
    due_date: "2026-09-30", status: "planned" });
  const mute = query(null);
  const preferences = query({ task_notifications: true });
  const event = query({ enabled: true, default_channels: { email: true } });
  const override = query(null);
  const notification = query(null);
  const rpc = jest.fn();
  const admin = {
    schema: jest.fn((schema: string) => ({
      from: jest.fn((table: string) => {
        if (schema === "users") return preferences;
        if (table === "notification_event_type") return event;
        if (table === "notification_event_override") return override;
        return notification;
      }),
      rpc,
    })),
  } as unknown as ReturnType<typeof createAdminClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    notification.insert.mockReset().mockResolvedValue({ error: null });
    jest.mocked(projectsDb).mockReturnValue({
      from: jest.fn((table: string) => table === "tasks" ? task : mute),
    } as unknown as ReturnType<typeof projectsDb>);
    preferences.maybeSingle.mockResolvedValue({ data: { task_notifications: true }, error: null });
    event.maybeSingle.mockResolvedValue({ data: { enabled: true, default_channels: { email: true } }, error: null });
    override.maybeSingle.mockResolvedValue({ data: null, error: null });
    notification.maybeSingle.mockResolvedValue({ data: null, error: null });
    notification.limit.mockResolvedValue({ data: [], error: null });
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "notification_user_channels" ? { email: true } :
        [{ address: "admin@admin.com", refusal: null }], error: null,
    }));
  });

  it("queues the admin's saved task through the declared event with a daily key", async () => {
    expect(await enqueueDueReminderEmail(admin, taskId, day)).toBe("queued");
    expect(rpc).toHaveBeenCalledWith("notification_user_channels", expect.objectContaining({
      p_event_key: "task.due_reminder", p_user: recipient,
    }));
    expect(rpc).toHaveBeenCalledWith("resolve_channel_address", expect.objectContaining({
      p_channel: "email", p_recipient_user_id: recipient,
    }));
    expect(notification.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_key: "task.due_reminder", channel: "email", status: "render_pending",
      recipient_user_id: recipient, organization_id: organization, target_id: taskId,
      dedupe_key: `task.due_reminder:${recipient}:${day}:email:1`,
      payload: { task: { title: "Review the monthly report", due: "2026-09-30",
        urgency_label: "Overdue", urgency_words: "overdue" } },
    }));
  });

  it("does not requeue a verified daily key or exceed three recorded intents", async () => {
    notification.maybeSingle.mockResolvedValueOnce({ data: {
      id: "existing", organization_id: organization, recipient_user_id: recipient,
      target_id: taskId, channel: "email", status: "render_pending",
    }, error: null });
    expect(await enqueueDueReminderEmail(admin, taskId, day)).toBe("duplicate");
    expect(notification.insert).not.toHaveBeenCalled();

    notification.limit.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }, { id: "c" }], error: null });
    expect(await enqueueDueReminderEmail(admin, taskId, day)).toBe("skipped");
    expect(notification.insert).not.toHaveBeenCalled();
  });

  it("moves to the next unique slot after another task claims the first", async () => {
    notification.insert.mockResolvedValueOnce({ error: { code: "23505" } })
      .mockResolvedValueOnce({ error: null });
    notification.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: {
        id: "occupied", organization_id: organization, recipient_user_id: recipient,
        target_id: "another-admin-task", channel: "email", event_key: "task.due_reminder",
      }, error: null });

    expect(await enqueueDueReminderEmail(admin, taskId, day)).toBe("queued");
    expect(notification.insert).toHaveBeenCalledTimes(2);
    expect(notification.insert.mock.calls.map(([row]) => row.dedupe_key)).toEqual([
      `task.due_reminder:${recipient}:${day}:email:1`,
      `task.due_reminder:${recipient}:${day}:email:2`,
    ]);
  });

  it("stops after three occupied daily slots, including simultaneous claims", async () => {
    notification.insert.mockResolvedValue({ error: { code: "23505" } });
    notification.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    for (const occupied of ["first", "second", "third"]) {
      notification.maybeSingle.mockResolvedValueOnce({ data: {
        id: occupied, organization_id: organization, recipient_user_id: recipient,
        target_id: occupied, channel: "email", event_key: "task.due_reminder",
      }, error: null });
    }

    expect(await enqueueDueReminderEmail(admin, taskId, day)).toBe("skipped");
    expect(notification.insert).toHaveBeenCalledTimes(3);
    expect(notification.insert.mock.calls.map(([row]) => row.dedupe_key)).toEqual(
      [1, 2, 3].map((slot) => `task.due_reminder:${recipient}:${day}:email:${slot}`),
    );
  });

  it("honors the admin's email opt-out before resolving an address", async () => {
    preferences.maybeSingle.mockResolvedValue({ data: { task_notifications: false }, error: null });
    expect(await enqueueDueReminderEmail(admin, taskId, day)).toBe("skipped");
    expect(rpc).not.toHaveBeenCalled();
    expect(notification.insert).not.toHaveBeenCalled();
  });
});
