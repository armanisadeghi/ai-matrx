import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (name: string) => readFileSync(join(__dirname, name), "utf8");

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
  });
});
