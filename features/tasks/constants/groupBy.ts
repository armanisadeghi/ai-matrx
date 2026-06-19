import type { TaskGroupBy } from "@/features/tasks/redux/taskUiSlice";

/** Short labels used in the sidebar View picker and list column banner. */
export const TASK_GROUP_BY_LABELS: Record<TaskGroupBy, string> = {
  project: "Project",
  scope: "Scope",
  priority: "Priority",
  status: "Status",
  dueDate: "Due",
  none: "Flat",
};

/** e.g. `BY PROJECT` — null when grouping is off (flat list). */
export function getTaskGroupByBanner(groupBy: TaskGroupBy): string | null {
  if (groupBy === "none") return null;
  return `BY ${TASK_GROUP_BY_LABELS[groupBy].toUpperCase()}`;
}
