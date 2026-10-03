import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const list = jest.fn();
const previewStatus = jest.fn();
let mockCapabilityPhase: "available" | "internal_test" = "internal_test";

jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({ organizationId: "org_1", organizationState: "ready" }),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user_1" }));
jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({ data: { connections: [{
    id: "connection_exact", owner_type: "user", owner_user_id: "user_1", health: "connected",
    scopes: ["https://www.googleapis.com/auth/tasks"], account_email: "reviewer@example.com",
  }] } }),
  useGoogleCapabilities: () => ({ data: [{
    key: "tasks_write", rollout_phase: mockCapabilityPhase, eligible: true, limitation: "", remedy: "",
  }] }),
}));
jest.mock("./service", () => ({
  listGoogleTasks: (...args: unknown[]) => list(...args),
  importGoogleTasks: jest.fn(),
  previewGoogleTaskStatus: (...args: unknown[]) => previewStatus(...args),
  applyGoogleTaskStatus: jest.fn(),
  createGoogleTask: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { GoogleTasksImportPanel } from "./GoogleTasksImportPanel";

test("the existing import panel binds status review to its exact listed connection and active list", async () => {
  mockCapabilityPhase = "internal_test";
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  list.mockResolvedValue({
    connection_id: "connection_exact", google_account: "reviewer@example.com",
    total: 1, already_imported: 0, importable: 1, warnings: [],
    task_lists: [{
      task_list_id: "list_exact", title: "Reviewer list", total: 1, already_imported: 0, importable: 1,
      has_more: false, count_line: "", tasks: [{
        task_id: "task_exact", title: "Review campaign", notes: null, due_at: null,
        status: "needsAction", completed_at: null, source_updated_at: "2026-10-03T12:00:00Z",
        already_imported: false, changes: [], kept_local: [], unrecorded: [],
      }],
    }],
  });
  previewStatus.mockResolvedValue({
    task_list_id: "list_exact", task_id: "task_exact", title: "Review campaign",
    current_status: "needsAction", desired_status: "completed", etag: "etag", receipt: "receipt",
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => root.render(<GoogleTasksImportPanel organizationId="org_1" />));
  await act(async () => { await Promise.resolve(); });
  expect(host.textContent).toContain("Google Tasks changes");
  const checkbox = host.querySelector('[aria-label="Select Review campaign"]') as HTMLButtonElement;
  await act(async () => checkbox.click());
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent === "Preview complete") as HTMLButtonElement;
  await act(async () => button.click());
  expect(previewStatus).toHaveBeenCalledWith({
    organization_id: "org_1", connection_id: "connection_exact", task_list_id: "list_exact",
    task_id: "task_exact", desired_status: "completed",
  });
  await act(async () => root.unmount());
  host.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

test("canonical eligibility keeps an approved available capability visible", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mockCapabilityPhase = "available";
  list.mockResolvedValue({
    connection_id: "connection_exact", google_account: "reviewer@example.com",
    total: 0, already_imported: 0, importable: 0, warnings: [],
    task_lists: [{ task_list_id: "list_exact", title: "Reviewer list", total: 0, already_imported: 0, importable: 0, has_more: false, count_line: "", tasks: [] }],
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<GoogleTasksImportPanel organizationId="org_1" />));
  await act(async () => { await Promise.resolve(); });
  expect(host.textContent).toContain("Google Tasks changes");
  expect(host.textContent).toContain("Create a task");
  await act(async () => root.unmount());
  host.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
