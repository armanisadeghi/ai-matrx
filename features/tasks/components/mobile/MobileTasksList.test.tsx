import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { CopyButtonsProps } from "@/components/agent-copy/CopyButtons";
import type { TaskWithProject } from "@/features/tasks/types";
import MobileTasksList from "./MobileTasksList";

const visibleTask = {
  id: "task-visible",
  title: "Visible task",
  description: "Only this task is in the filtered list.",
  status: "active",
  completed: false,
  attachments: [],
  projectId: "project-1",
  projectName: "Product",
  priority: "high",
  dueDate: "2026-09-15",
  startDate: null,
  completedAt: null,
  recurrenceRule: null,
  assigneeId: null,
  assigneeName: null,
  parentTaskId: null,
  subtasks: [],
  updatedAt: null,
  origin: "user",
  sourceType: null,
  sourceUrl: null,
  sourceLabel: null,
  settings: {},
} as unknown as TaskWithProject;

let mockFilteredTasks: TaskWithProject[] = [visibleTask];
let mockSearchQuery = "visible";
let mockCopyProps: CopyButtonsProps | undefined;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock("@/features/tasks/redux/selectors", () => ({
  selectFilteredTasks: () => mockFilteredTasks,
  selectProjects: () => [{ id: "project-1", name: "Product" }],
}));

jest.mock("@/features/tasks/redux/taskUiSlice", () => ({
  selectNewTaskTitle: () => "",
  selectIsCreatingTask: () => false,
  selectSearchQuery: () => mockSearchQuery,
  selectShowAllProjects: () => true,
  selectActiveProject: () => "project-1",
  selectShowCompleted: () => false,
  selectSmartView: () => "today",
  setNewTaskTitle: (value: string) => ({ type: "tasks/title", payload: value }),
  setSearchQuery: (value: string) => ({ type: "tasks/search", payload: value }),
}));

jest.mock("@/features/tasks/redux/thunks", () => ({
  createTaskThunk: jest.fn(),
  toggleTaskCompleteThunk: jest.fn(),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "org-1",
  selectScopeSelectionsContext: () => ({}),
}));

jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: (props: CopyButtonsProps) => {
    mockCopyProps = props;
    return <button type="button">Copy task list</button>;
  },
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@ai-matrx/design-system", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

jest.mock("@/components/ui/checkbox", () => ({
  Checkbox: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="checkbox" {...props} />
  ),
}));

jest.mock("./MobileFilterMenu", () => () => <div>Filters</div>);
jest.mock("./MobileProjectSelector", () => () => null);
jest.mock("@/features/agent-context/components/ScopeTagsDisplay", () => ({
  ScopeTagsDisplay: () => null,
}));
jest.mock("../TaskScopeFilter", () => ({ ActiveScopeFilterChips: () => null }));
jest.mock("@/components/matrx/resizable/MatrxDynamicPanelHost", () => ({
  MatrxDynamicPanelHost: () => null,
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock("@/features/tasks/agent-context/buildTasksContextData", () => ({
  TASKS_CONTEXT_MENU_PROPS: { sourceFeature: "tasks", surfaceName: "Tasks" },
}));
jest.mock("@/features/tasks/components/TasksListSurfaceRuntime", () => ({
  useTasksListSurfaceScope: () => () => ({}),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

beforeEach(() => {
  mockFilteredTasks = [visibleTask];
  mockSearchQuery = "visible";
  mockCopyProps = undefined;
});

it("keeps the mobile copy identity stable while the visible filter result changes", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<MobileTasksList onTaskSelect={jest.fn()} />));

  expect(container.textContent).toContain("Visible task");
  expect(mockCopyProps?.size).toBe("sm");
  expect(mockCopyProps?.export?.items).toEqual([]);
  const firstSourceId = mockCopyProps?.sourceId;
  const firstPayload =
    typeof mockCopyProps?.agent === "function"
      ? mockCopyProps.agent()
      : undefined;
  expect(firstPayload).toMatchObject({
    kind: "tasks-list",
    data: { tasks: [{ id: "task-visible" }] },
    context: {
      smart_view: "today",
      project: "Product",
      search_query: "visible",
      show_completed: false,
    },
  });

  mockFilteredTasks = [
    { ...visibleTask, id: "task-narrowed", title: "Narrowed task" },
  ];
  mockSearchQuery = "narrowed";
  act(() => root.render(<MobileTasksList onTaskSelect={jest.fn()} />));

  const narrowedPayload =
    typeof mockCopyProps?.agent === "function"
      ? mockCopyProps.agent()
      : undefined;
  expect(mockCopyProps?.sourceId).toBe(firstSourceId);
  expect(narrowedPayload).toMatchObject({
    data: { tasks: [{ id: "task-narrowed" }] },
    context: { search_query: "narrowed" },
  });
  act(() => root.unmount());
  container.remove();
});

it("does not offer list copy before the mobile list can render tasks", () => {
  mockFilteredTasks = [];

  renderToStaticMarkup(<MobileTasksList onTaskSelect={jest.fn()} />);

  expect(mockCopyProps).toBeUndefined();
});
