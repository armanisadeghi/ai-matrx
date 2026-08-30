import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (name: string) => readFileSync(join(__dirname, name), "utf8");
const projectSource = (name: string) =>
  readFileSync(
    join(__dirname, "..", "..", "projects", "components", name),
    "utf8",
  );
const taskRouteSource = () =>
  readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "..",
      "app",
      "(core)",
      "tasks",
      "[id]",
      "page.tsx",
    ),
    "utf8",
  );

describe("task lifecycle responsive contract", () => {
  it("keeps date-only table labels out of UTC parsing", () => {
    const table = source("TasksTableView.tsx");

    expect(table).toContain("formatDateOnly(task.dueDate");
    expect(table).not.toContain("formatReadableDate(task.dueDate");
  });

  it("keeps lifecycle controls touch-sized through tablet widths", () => {
    expect(source("TaskStatusPicker.tsx")).toContain("h-6 max-lg:min-h-11");
    expect(source("TaskSnoozeButton.tsx")).toContain("h-6 max-lg:h-11");
    expect(source("TaskRecurrencePicker.tsx")).toContain("h-6 max-lg:h-11");

    const dueDatePicker = source("TaskDueDatePicker.tsx");
    expect(dueDatePicker).toContain("h-8 max-lg:h-11");
    expect(dueDatePicker).toContain("h-6 max-lg:h-11");
    expect(source("TaskPriorityPicker.tsx")).toContain("h-6 max-lg:h-11");
  });

  it("keeps smart-view targets touch-sized through tablet widths", () => {
    expect(source("TasksContextSidebar.tsx")).toContain(
      "px-1.5 py-1 max-lg:min-h-11",
    );
  });

  it("keeps the narrow-pane view toggle clear of quick-add actions", () => {
    const listPane = source("TaskListPane.tsx");

    expect(listPane).toContain("flex flex-wrap items-center gap-2");
    expect(listPane).toContain("order-last flex basis-full gap-1 min-w-0");
  });

  it("keeps project-task metadata fixed while long titles truncate", () => {
    const projectTasks = projectSource("ProjectTaskList.tsx");

    expect(projectTasks).toContain('<Table className="table-fixed">');
    expect(projectTasks).toContain('<col className="w-16 sm:w-32" />');
    expect(projectTasks).toContain('<col className="w-20 sm:w-28" />');
    expect(projectTasks).toContain("title={value}");
    expect(projectTasks).toContain(
      '"flex-1 min-w-0 text-left truncate rounded px-1 -mx-1 hover:bg-accent/50"',
    );
  });

  it("keeps full task titles hoverable on compact and mobile lists", () => {
    expect(source("CompactTaskItem.tsx")).toContain("title={task.title}");
    expect(source("EditableTaskTitle.tsx")).toContain("title={title}");
    expect(source("mobile/MobileTasksList.tsx")).toContain(
      "title={task.title}",
    );
  });

  it("keeps the mobile completion control valid and touch-sized", () => {
    const mobileList = source("mobile/MobileTasksList.tsx");

    expect(mobileList).toContain("after:-inset-[15px]");
    expect(mobileList).not.toContain(
      'className="flex min-h-11 min-w-11 items-center justify-center"',
    );
  });

  it("keeps live-state copy actions in the mobile task editor", () => {
    const mobileDetails = source("mobile/MobileTaskDetails.tsx");
    const mobileView = source("mobile/MobileTasksView.tsx");

    expect(mobileDetails).toContain("TaskEditorCopyButtonsForDraft");
    expect(mobileDetails).toContain('location="Tasks — mobile task editor"');
    expect(mobileDetails).toContain("description,");
    expect(mobileDetails).toContain("isDirty,");
    expect(mobileView).toContain("useEnsureTaskLoaded(taskId)");
    expect(mobileView).toContain("task && isFullData");
    expect(mobileView).toContain('what="task details"');
    expect(mobileView).toContain("<Skeleton");
  });

  it("keeps every task editor header on the live draft copy control", () => {
    const editor = source("TaskEditor.tsx");
    const route = taskRouteSource();

    expect(editor).toContain("routeHeader?: ReactNode");
    expect(editor).toContain("{routeHeader}");
    expect(editor).toContain(
      'routeHeader ? { paddingTop: "var(--shell-header-h)" } : undefined',
    );
    expect(editor).toContain("TaskEditorCopyButtons");
    expect(editor).not.toContain("TaskCopyForAiButton");
    expect(route).toContain("TaskEditorCopyButtons");
    expect(route).toContain("routeHeader={taskHeader}");
    expect(route).toContain(
      'className="ml-auto hidden shrink-0 items-center gap-0.5 sm:flex"',
    );
    expect(route).not.toContain("TaskCopyForAiButton");
  });

  it("keeps search on the project task list", () => {
    const projectTasks = projectSource("ProjectTaskList.tsx");

    expect(projectTasks).toContain('aria-label="Search project tasks"');
    expect(projectTasks).toContain("matchesTaskTree");
    expect(projectTasks).toContain("visibleChildrenOf");
  });
});
