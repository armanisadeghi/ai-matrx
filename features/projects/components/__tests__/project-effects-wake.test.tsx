/**
 * A project's name editor and task list survive effects that re-run without
 * a remount — a board tile that sleeps (React `<Activity>` hidden) and wakes.
 * The name editor's sync effect used to reset the draft to the saved name on
 * every run, and the task list read again on every run, swapping its rows for
 * a spinner (open editors and scroll gone).
 */
import React, { Activity, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReads: string[] = [];
jest.mock("@/features/tasks/services/taskService", () => ({
  getProjectTasks: (projectId: string) => {
    mockReads.push(projectId);
    return Promise.resolve([
      { id: "t-1", title: "Confirm the pallet count with receiving", status: "incomplete", project_id: projectId },
    ]);
  },
  createTask: jest.fn(),
  updateTaskResult: jest.fn(),
}));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("@/features/overlays/openers/taskEditorWindow", () => ({ useOpenTaskEditorWindow: () => () => undefined }));
jest.mock("@/features/tasks/components/TaskCopyForAiButton", () => ({ TaskCopyForAiButton: () => null }));
jest.mock("@/features/tasks/components/TaskDueDatePicker", () => ({ TaskDueDatePicker: () => null }));
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => ({ organizations: [] }) }));
jest.mock("../../service", () => ({ updateProject: jest.fn() }));
// The official inputs carry AI actions (redux); a plain field stands in.
jest.mock("@/components/official/ProInput", () => ({
  ProInput: ({ wrapperClassName: _w, showCopyButton: _c, ...props }: React.InputHTMLAttributes<HTMLInputElement> & Record<string, unknown>) => (
    <input {...props} />
  ),
}));
jest.mock("@/components/official/ProTextarea", () => ({ ProTextarea: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import { InlineProjectName } from "../ProjectInlineEditors";
import { ProjectTaskList } from "../ProjectTaskList";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  mockReads.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(ui: React.ReactNode) {
  await act(async () => root.render(ui));
  await act(async () => {
    await tick(10);
  });
}

const project = {
  id: "p-warehouse",
  name: "Warehouse move",
  slug: null,
  description: null,
  organizationId: "org-1",
  status: "active",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
} as const;

it("a wake keeps the name being typed", async () => {
  const ui = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <InlineProjectName project={project} canEdit onPatch={() => undefined} />
    </Activity>
  );
  await render(ui("visible"));
  await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
  const input = host.querySelector("input") as HTMLInputElement;
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(input, "Warehouse move — phase two");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await render(ui("hidden"));
  await render(ui("visible"));
  expect((host.querySelector("input") as HTMLInputElement).value).toBe("Warehouse move — phase two");
});

it("a renamed project still updates the name shown", async () => {
  await render(<InlineProjectName project={project} canEdit onPatch={() => undefined} />);
  await render(<InlineProjectName project={{ ...project, name: "Warehouse relocation" }} canEdit onPatch={() => undefined} />);
  expect(host.textContent).toContain("Warehouse relocation");
});

it("a wake does not read the task list again", async () => {
  const ui = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <ProjectTaskList projectId="p-warehouse" organizationId="org-1" />
    </Activity>
  );
  await render(ui("visible"));
  expect(host.textContent).toContain("Confirm the pallet count");
  await render(ui("hidden"));
  await render(ui("visible"));
  expect(mockReads).toEqual(["p-warehouse"]);
  expect(host.textContent).toContain("Confirm the pallet count");
});
