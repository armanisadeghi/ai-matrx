// features/connectors/import/tasks-project-naming.test.tsx
//
// VERIFY-B1-B2-R4 V8: the Tasks import posts a `project_id` no screen names.
// `GoogleTasksImportPanel` takes `projectId` and writes it onto every task the
// import creates, but nothing on the panel ever said so — the only opener on
// this build (`TasksHeaderControls`) passes none, so it is always null today,
// and a person ticking boxes had no way to know where they would land. The
// Gmail compose panel already names its project before the click
// (`<EntityRef token="project"/>`); this panel now does the same, and says so
// explicitly when there is none to name — never silent either way.

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockList = jest.fn();

jest.mock("./service", () => ({
  listGoogleTasks: (...args: unknown[]) => mockList(...args),
  importGoogleTasks: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ id }: { id: string }) => <span data-testid="project-ref">{id}</span>,
}));

// eslint-disable-next-line import/first -- after the mocks above
import { GoogleTasksImportPanel } from "./GoogleTasksImportPanel";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockList.mockReset();
  mockList.mockResolvedValue({
    google_account: "me@example.com",
    task_lists: [
      {
        task_list_id: "list-1",
        title: "My Tasks",
        total: 0,
        already_imported: 0,
        has_more: false,
        tasks: [],
      },
    ],
    warnings: [],
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  act(() => root.unmount());
  container.remove();
});

async function renderWith(projectId: string | null) {
  await act(async () => {
    root.render(
      <GoogleTasksImportPanel organizationId="org-1" projectId={projectId} />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container.textContent ?? "";
}

describe("the Tasks import names the project it will write onto every task", () => {
  it("names the project when the opener gave one", async () => {
    const text = await renderWith("project-1");
    expect(text).toContain("Importing into");
    const ref = container.querySelector('[data-testid="project-ref"]');
    expect(ref?.textContent).toBe("project-1");
  });

  it("says explicitly there is no project, rather than staying silent (RED before the fix: nothing named it)", async () => {
    const text = await renderWith(null);
    expect(text).toMatch(/without a project/i);
    expect(text).not.toBe("");
  });
});
