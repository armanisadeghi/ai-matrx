import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (name: string) => readFileSync(join(__dirname, name), "utf8");
const projectSource = (name: string) =>
  readFileSync(
    join(__dirname, "..", "..", "projects", "components", name),
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

  it("keeps search on the project task list", () => {
    const projectTasks = projectSource("ProjectTaskList.tsx");

    expect(projectTasks).toContain('aria-label="Search project tasks"');
    expect(projectTasks).toContain("matchesTaskTree");
    expect(projectTasks).toContain("visibleChildrenOf");
  });
});
