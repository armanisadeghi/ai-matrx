import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BackendApiError } from "@/lib/api/errors";
import { GoogleTasksWriteControls, type GoogleTasksWriteTransport } from "./GoogleTasksWriteControls";
import {
  GOOGLE_TASK_CREATE_RECOVERY_KEY,
  type GoogleTaskCreateRecoveryRecord,
  type StorageDoor,
} from "./googleTaskCreateRecovery";

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

function memoryStorage(): StorageDoor & { value(): string | null } {
  let stored: string | null = null;
  return {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
    removeItem: () => { stored = null; },
    value: () => stored,
  };
}

const task = {
  task_id: "task_1",
  title: "Send reviewer notes",
  notes: null,
  due_at: null,
  status: "needsAction",
  completed_at: null,
  source_updated_at: "2026-10-03T12:00:00Z",
};

function baseTransport(): jest.Mocked<GoogleTasksWriteTransport> {
  return {
    previewStatus: jest.fn(),
    applyStatus: jest.fn(),
    create: jest.fn(),
  };
}

const props = {
  actorId: "user_1",
  organizationId: "org_1",
  connectionId: "connection_1",
  accountLabel: "reviewer@example.com",
  taskListId: "list_1",
  taskListTitle: "Reviewer list",
  selectedTask: task,
  onRefresh: jest.fn(),
};

const validRecoveredRequest = {
  organization_id: "org_1", connection_id: "connection_1", task_list_id: "list_1",
  caller_stable_key: "stable_key_123456", title: "Recovered", notes: null, due: null,
};

describe("GoogleTasksWriteControls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    props.onRefresh.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const button = (label: string) =>
    [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement;

  const input = (label: string) =>
    [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))?.querySelector("input") as HTMLInputElement;

  const changeInput = (label: string, value: string) => {
    const element = input(label);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("HTML input value setter unavailable");
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };

  test("persists attempting before the sole create and clears only after a verified remote id", async () => {
    const storage = memoryStorage();
    const transport = baseTransport();
    transport.create.mockImplementation(async (request) => {
      const stored = JSON.parse(storage.value() ?? "null") as GoogleTaskCreateRecoveryRecord;
      expect(stored.phase).toBe("attempting");
      expect(stored.request).toEqual(request);
      return { task_list_id: "list_1", remote_task_id: "remote_77", confirmation: "provider_insert_response", replayed: false };
    });
    await act(async () => root.render(<GoogleTasksWriteControls {...props} storage={storage} transport={transport} />));
    await act(async () => {
      changeInput("Title", "  Ship proof  ");
    });
    await act(async () => button("Review create").click());
    expect(JSON.parse(storage.value() ?? "null").phase).toBe("reviewed_unattempted");
    await act(async () => button("Create in Google").click());
    expect(transport.create).toHaveBeenCalledTimes(1);
    expect(transport.create.mock.calls[0][0]).toMatchObject({
      organization_id: "org_1", connection_id: "connection_1", task_list_id: "list_1", title: "Ship proof",
    });
    expect(storage.value()).toBeNull();
    expect(container.textContent).toContain("Google confirmed task ID: remote_77");
  });

  test("stops before transport when recovery cannot be saved", async () => {
    const storage: StorageDoor = {
      getItem: () => null,
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => undefined,
    };
    const transport = baseTransport();
    await act(async () => root.render(<GoogleTasksWriteControls {...props} storage={storage} transport={transport} />));
    await act(async () => {
      changeInput("Title", "Do not send");
    });
    await act(async () => button("Review create").click());
    expect(transport.create).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Nothing was sent");
  });

  test("stops before transport when the attempting checkpoint cannot be saved", async () => {
    let value: string | null = null;
    let writes = 0;
    const storage: StorageDoor = {
      getItem: () => value,
      setItem: (_key, next) => {
        writes += 1;
        if (writes > 1) throw new Error("blocked before post");
        value = next;
      },
      removeItem: () => { value = null; },
    };
    const transport = baseTransport();
    await act(async () => root.render(<GoogleTasksWriteControls {...props} storage={storage} transport={transport} />));
    await act(async () => {
      changeInput("Title", "Checkpoint first");
    });
    await act(async () => button("Review create").click());
    await act(async () => button("Create in Google").click());
    expect(transport.create).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Nothing was sent");
  });

  test("restores attempting as uncertain and never offers a create retry", async () => {
    const storage = memoryStorage();
    storage.setItem(GOOGLE_TASK_CREATE_RECOVERY_KEY, JSON.stringify({
      version: 1, actor_id: "user_1", phase: "attempting",
      request: { organization_id: "org_1", connection_id: "connection_1", task_list_id: "list_1", caller_stable_key: "stable_key_123456", title: "Possibly landed", notes: null, due: null },
    }));
    const transport = baseTransport();
    await act(async () => root.render(<GoogleTasksWriteControls {...props} storage={storage} transport={transport} />));
    expect(JSON.parse(storage.value() ?? "null").phase).toBe("uncertain");
    expect(button("Create in Google")).toBeUndefined();
    expect(button("Retry reviewed create")).toBeUndefined();
    expect(container.textContent).toContain("do not create it again by title");
  });

  test.each([
    ["caller key", { ...validRecoveredRequest, caller_stable_key: "x" }],
    ["title", { ...validRecoveredRequest, title: "   " }],
    ["identity", { ...validRecoveredRequest, connection_id: "c".repeat(129) }],
    ["list id", { ...validRecoveredRequest, task_list_id: "unsafe/list" }],
    ["field length", { ...validRecoveredRequest, notes: "n".repeat(8193) }],
    ["due", { ...validRecoveredRequest, due: "not-a-date" }],
    ["extra field", { ...validRecoveredRequest, unexpected: true }],
  ])("invalid recovered %s is ignored without transport", async (_family, request) => {
    const storage = memoryStorage();
    storage.setItem(GOOGLE_TASK_CREATE_RECOVERY_KEY, JSON.stringify({
      version: 1, actor_id: "user_1", phase: "known_unsent", request,
    }));
    const transport = baseTransport();
    await act(async () => root.render(<GoogleTasksWriteControls {...props} storage={storage} transport={transport} />));
    expect(container.textContent).toContain("invalid task recovery record was ignored");
    expect(button("Retry reviewed create")).toBeUndefined();
    expect(transport.create).not.toHaveBeenCalled();
  });

  test("a known-unsent failure retries only the identical request and key", async () => {
    const storage = memoryStorage();
    const request = { organization_id: "org_1", connection_id: "connection_1", task_list_id: "list_1", caller_stable_key: "stable_key_123456", title: "Safe retry", notes: "Same notes", due: null };
    storage.setItem(GOOGLE_TASK_CREATE_RECOVERY_KEY, JSON.stringify({ version: 1, actor_id: "user_1", phase: "known_unsent", request }));
    const transport = baseTransport();
    transport.create.mockResolvedValue({ task_list_id: "list_1", remote_task_id: "remote_88", confirmation: "durable_record", replayed: true });
    await act(async () => root.render(<GoogleTasksWriteControls {...props} storage={storage} transport={transport} />));
    await act(async () => button("Retry reviewed create").click());
    expect(transport.create).toHaveBeenCalledWith(request);
  });

  test("applies exactly the fresh status review receipt once", async () => {
    const storage = memoryStorage();
    const transport = baseTransport();
    transport.previewStatus.mockResolvedValue({
      task_list_id: "list_1", task_id: "task_1", title: task.title,
      current_status: "needsAction", desired_status: "completed", etag: "etag-1", receipt: "signed-receipt",
    });
    transport.applyStatus.mockResolvedValue({
      task_list_id: "list_1", task_id: "task_1", title: task.title,
      current_status: "completed", desired_status: "completed", etag: "etag-2", receipt: "signed-receipt", verified: true,
    });
    await act(async () => root.render(<GoogleTasksWriteControls {...props} storage={storage} transport={transport} />));
    await act(async () => button("Preview complete").click());
    expect(container.textContent).toContain("Open → Completed");
    await act(async () => {
      button("Apply reviewed status").click();
      button("Apply reviewed status")?.click();
    });
    expect(transport.applyStatus).toHaveBeenCalledTimes(1);
    expect(transport.applyStatus).toHaveBeenCalledWith({
      organization_id: "org_1", connection_id: "connection_1", task_list_id: "list_1",
      task_id: "task_1", desired_status: "completed", review_receipt: "signed-receipt",
    });
    expect(container.textContent).toContain("Google verified Send reviewer notes as Completed");
    await act(async () => button("Refresh source").click());
    await act(async () => root.render(<GoogleTasksWriteControls {...props} selectedTask={{ ...task, status: "completed" }} storage={storage} transport={transport} />));
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(button("Preview reopen")).toBeDefined();
    expect(container.textContent).not.toContain("Google verified Send reviewer notes as Completed");
  });

  test("a task change rejects a late preview and cannot reuse its receipt", async () => {
    const storage = memoryStorage();
    const transport = baseTransport();
    let finish!: (result: Awaited<ReturnType<GoogleTasksWriteTransport["previewStatus"]>>) => void;
    transport.previewStatus.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => root.render(<GoogleTasksWriteControls key="task-1" {...props} storage={storage} transport={transport} />));
    await act(async () => button("Preview complete").click());
    await act(async () => root.render(<GoogleTasksWriteControls key="task-2" {...props} selectedTask={{ ...task, task_id: "task_2", title: "New selection" }} storage={storage} transport={transport} />));
    await act(async () => finish({
      task_list_id: "list_1", task_id: "task_1", title: task.title,
      current_status: "needsAction", desired_status: "completed", etag: "etag-old", receipt: "old-receipt",
    }));
    expect(container.textContent).not.toContain("Fresh review receipt ready");
    expect(button("Apply reviewed status")).toBeUndefined();
    expect(transport.applyStatus).not.toHaveBeenCalled();
  });

  test("an old create response cannot clear a newer scope recovery record", async () => {
    const storage = memoryStorage();
    const transport = baseTransport();
    let finish!: (result: { task_list_id: string; remote_task_id: string; confirmation: "provider_insert_response" }) => void;
    transport.create.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => root.render(<GoogleTasksWriteControls key="old" {...props} storage={storage} transport={transport} />));
    await act(async () => {
      changeInput("Title", "Old request");
    });
    await act(async () => button("Review create").click());
    await act(async () => button("Create in Google").click());
    await act(async () => root.render(<GoogleTasksWriteControls key="new" {...props} taskListId="list_2" taskListTitle="Other list" storage={storage} transport={transport} />));
    const preserved = JSON.parse(storage.value() ?? "null");
    await act(async () => finish({ task_list_id: "list_1", remote_task_id: "late", confirmation: "provider_insert_response" }));
    expect(JSON.parse(storage.value() ?? "null")).toEqual(preserved);
    expect(container.textContent).not.toContain("remote_77");
  });

  test("a server-confirmed never-sent error becomes the sole safe retry", async () => {
    const storage = memoryStorage();
    const transport = baseTransport();
    transport.create.mockRejectedValue(new BackendApiError({
      code: "google_task_create_storage_unavailable",
      detail: "intent table unavailable",
      userMessage: "Nothing was sent.",
      status: 503,
    }));
    await act(async () => root.render(<GoogleTasksWriteControls {...props} storage={storage} transport={transport} />));
    await act(async () => {
      changeInput("Title", "Retryable");
    });
    await act(async () => button("Review create").click());
    await act(async () => button("Create in Google").click());
    expect(JSON.parse(storage.value() ?? "null").phase).toBe("known_unsent");
    expect(button("Retry reviewed create")).toBeDefined();
  });
});
