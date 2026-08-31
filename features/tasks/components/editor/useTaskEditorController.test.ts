import type { TaskRecord } from "@/features/agent-context/redux/tasksSlice";
import { resolveTaskEditorEffective } from "@/features/tasks/components/editor/useTaskEditorController";

const baseTask: TaskRecord = {
  id: "task-1",
  title: "Certify Tasks",
  description: "Before save",
  status: "planned",
  priority: null,
  due_date: null,
  assignee_id: null,
  project_id: "project-1",
  parent_task_id: null,
  organization_id: "org-1",
  settings: { labels: [] },
};

describe("resolveTaskEditorEffective", () => {
  it("reads the saved Redux entity after the draft clears", () => {
    const savedTask: TaskRecord = {
      ...baseTask,
      status: "active",
      settings: { labels: ["bug", "docs"] },
    };

    expect(resolveTaskEditorEffective(savedTask, {})).toMatchObject({
      status: "active",
      labels: ["bug", "docs"],
    });
  });

  it("preserves null as the canonical no-priority draft value", () => {
    expect(
      resolveTaskEditorEffective(
        { ...baseTask, priority: "high" },
        { priority: null },
      ).priority,
    ).toBeNull();
  });
});
