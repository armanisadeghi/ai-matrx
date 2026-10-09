"use client";

import { useTasksRead } from "@/features/tasks/hooks/useTasksRead";
import React from "react";
import { CheckCircle2, CircleDashed, Folder } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFilteredTasks,
  UNASSIGNED_PROJECT_ID,
} from "@/features/tasks/redux/selectors";
import {
  selectSelectedTaskId,
  setSelectedTaskId,
  selectFilterOrgId,
  setFilterOrgId,
} from "@/features/tasks/redux/taskUiSlice";
import { toggleTaskCompleteThunk } from "@/features/tasks/redux/thunks";
import { TASK_LABEL_OPTIONS } from "@/features/tasks/services/taskService";
import { Button } from "@/components/ui/button";
import { keyFieldsAiVariant } from "@/features/marketing/lib/copy-payloads";
import {
  TASKS_LOCATION,
  buildTaskListPayload,
  taskListHuman,
  taskRow,
  taskSummary,
} from "@/features/tasks/lib/copy";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { TaskProvenanceChip } from "@/features/tasks/components/TaskProvenanceChip";
import {
  TASK_TITLE_DOM_ATTR,
} from "@/features/tasks/components/TasksListContextMenu";
import {
  formatAbsoluteDate,
  formatRelativeTime,
  toEpochMs,
} from "@/utils/datetime";
import { formatDateOnly } from "@ai-matrx/kit/dates";
import type { TaskWithProject } from "@/features/tasks/types";
import { toast } from "@/lib/toast";

type DueBucket = "Overdue" | "Today" | "Next 7 days" | "Later" | "No due date";

const DUE_BUCKET_OPTIONS: Array<{ value: DueBucket; label: string }> = [
  { value: "Overdue", label: "Overdue" },
  { value: "Today", label: "Due today" },
  { value: "Next 7 days", label: "Due within 7 days" },
  { value: "Later", label: "Later" },
  { value: "No due date", label: "No due date" },
];

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  __none__: 3,
};

const LABEL_BY_VALUE = Object.fromEntries(
  TASK_LABEL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<string, string>;

function dueBucket(
  task: TaskWithProject,
  todayStr: string,
  weekStr: string,
): DueBucket {
  if (!task.dueDate) return "No due date";
  if (task.dueDate < todayStr) return task.completed ? "Later" : "Overdue";
  if (task.dueDate === todayStr) return "Today";
  if (task.dueDate <= weekStr) return "Next 7 days";
  return "Later";
}

function priorityLabel(priority: TaskWithProject["priority"]): string {
  if (priority === "high") return "High";
  if (priority === "medium") return "Medium";
  if (priority === "low") return "Low";
  return "—";
}

export default function TasksTableView() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectFilteredTasks);
  const filterOrgId = useAppSelector(selectFilterOrgId);
  const tasksRead = useTasksRead();
  const selectedTaskId = useAppSelector(selectSelectedTaskId);

  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = today.toISOString().split("T")[0];
  const weekStr = React.useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }, [today]);

  const columns = React.useMemo<MatrxColumnDef<TaskWithProject>[]>(
    () => [
      {
        id: "status",
        header: <span className="sr-only">Status</span>,
        label: "Status",
        accessorFn: (task) => (task.completed ? "Completed" : "Open"),
        sortValue: (task) => Number(task.completed),
        defaultSortDirection: "desc",
        filterOptions: [
          { value: "Open", label: "Open" },
          { value: "Completed", label: "Completed" },
        ],
        width: 56,
        cell: (task) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void dispatch(toggleTaskCompleteThunk({ taskId: task.id }))
                .unwrap()
                .catch((error) => {
                  console.error("Error changing task completion:", error);
                  toast.error("Could not update task completion");
                });
            }}
            className="text-muted-foreground/70 hover:text-primary transition-colors"
            title={task.completed ? "Mark incomplete" : "Mark complete"}
          >
            {task.completed ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <CircleDashed className="h-3.5 w-3.5" />
            )}
          </button>
        ),
      },
      {
        id: "title",
        header: "Task",
        accessorKey: "title",
        filter: "text",
        width: 360,
        cell: (task) => {
          const labels = (task.settings?.labels ?? []) as string[];
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              {/* THE DOOR LAW. The row already selects the task into the
                  detail pane; the name keeps cmd/middle-click to /tasks/{id}
                  and the hover peek. */}
              <span className="min-w-0 truncate" {...{ [TASK_TITLE_DOM_ATTR]: task.id }}>
                <EntityRef
                  token="task"
                  id={task.id}
                  name={task.title}
                  showIcon={false}
                  onOpen={() => dispatch(setSelectedTaskId(task.id))}
                  className="text-[13px]"
                  labelClassName={
                    task.completed
                      ? "line-through text-muted-foreground"
                      : "font-medium text-foreground"
                  }
                />
              </span>
              {labels.slice(0, 2).map((label) => (
                <Badge
                  key={label}
                  variant="outline"
                  className="h-4 shrink-0 px-1 text-[9px] font-normal"
                >
                  {LABEL_BY_VALUE[label] ?? label}
                </Badge>
              ))}
              {labels.length > 2 && (
                <span className="shrink-0 text-[9px] text-muted-foreground">
                  +{labels.length - 2}
                </span>
              )}
              <TaskProvenanceChip
                compact
                origin={task.origin ?? null}
                sourceType={task.sourceType ?? null}
                sourceUrl={task.sourceUrl ?? null}
                sourceLabel={task.sourceLabel ?? null}
                className="max-w-[180px] shrink-0"
              />
            </div>
          );
        },
      },
      {
        id: "project",
        header: "Project",
        accessorFn: (task) =>
          task.projectId === UNASSIGNED_PROJECT_ID || !task.projectId
            ? "Unassigned"
            : task.projectName,
        width: 180,
        cell: (task) =>
          task.projectId === UNASSIGNED_PROJECT_ID || !task.projectId ? (
            <span className="inline-flex min-w-0 max-w-[160px] items-center gap-1 text-sm text-muted-foreground">
              <Folder className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {task.projectId === UNASSIGNED_PROJECT_ID ? "Unassigned" : "—"}
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              <EntityRef
                token="project"
                id={task.projectId}
                name={task.projectName}
                className="max-w-[160px]"
              />
            </span>
          ),
      },
      {
        id: "priority",
        header: "Priority",
        accessorFn: (task) => priorityLabel(task.priority),
        sortValue: (task) => PRIORITY_ORDER[task.priority ?? "__none__"] ?? 99,
        filterOptions: [
          { value: "High", label: "High" },
          { value: "Medium", label: "Medium" },
          { value: "Low", label: "Low" },
          { value: "—", label: "None" },
        ],
        width: 110,
        cell: (task) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
            {task.priority && (
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  task.priority === "high" && "bg-red-500",
                  task.priority === "medium" && "bg-amber-500",
                  task.priority === "low" && "bg-green-500",
                )}
              />
            )}
            {priorityLabel(task.priority)}
          </span>
        ),
      },
      {
        id: "dueDate",
        header: "Due",
        accessorFn: (task) => task.dueDate || null,
        sortValue: (task) => task.dueDate || "9999-12-31",
        filterValue: (task) => dueBucket(task, todayStr, weekStr),
        filter: "select",
        filterOptions: DUE_BUCKET_OPTIONS,
        width: 120,
        cell: (task) => {
          const isPastDue =
            !!task.dueDate && task.dueDate < todayStr && !task.completed;
          return (
            <span
              className={cn(
                "whitespace-nowrap text-xs",
                isPastDue
                  ? "text-destructive font-medium"
                  : "text-muted-foreground",
              )}
            >
              {task.dueDate
                ? formatDateOnly(task.dueDate, { month: "short", day: "numeric" })
                : "—"}
            </span>
          );
        },
      },
      {
        id: "updated",
        header: "Updated",
        accessorFn: (task) => task.updatedAt,
        sortValue: (task) => toEpochMs(task.updatedAt),
        defaultSortDirection: "desc",
        filter: "date",
        width: 140,
        cell: (task) => (
          <span
            className="whitespace-nowrap text-xs text-muted-foreground"
            title={formatAbsoluteDate(task.updatedAt)}
          >
            {formatRelativeTime(task.updatedAt, { style: "long" })}
          </span>
        ),
      },
    ],
    [dispatch, todayStr, weekStr],
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <MatrxDataTable<TaskWithProject>
        tableId="tasks-table"
        data={tasks}
        columns={columns}
        getRowId={(task) => task.id}
        defaultSort={{ id: "updated", direction: "desc" }}
        searchText={(task) => `${task.title} ${task.projectName ?? ""}`}
        zebra
        pageSize={0}
        frameHeight="fill"
        selectedId={selectedTaskId}
        detail={{ enabled: false }}
        onRowOpen={(task) => dispatch(setSelectedTaskId(task.id))}
        window={{}}
        getRowHref={(task) => `/tasks/${task.id}`}
        read={{
          status: tasksRead.status,
          error: tasksRead.error ?? undefined,
          onRetry: tasksRead.retry,
          what: "your tasks",
        }}
        emptyState={{
          title: "No tasks match these filters.",
          ...(filterOrgId
            ? {
                action: (
                  <Button
                    variant="outline"
                    onClick={() => dispatch(setFilterOrgId(null))}
                  >
                    View all organizations
                  </Button>
                ),
              }
            : {}),
        }}
        copy={{
          label: "Task",
          listLabel: "Task table",
          location: TASKS_LOCATION,
          rowKind: "task",
          listKind: "tasks-list",
          humanRow: taskSummary,
          agentRow: taskRow,
          listHuman: (visible) => taskListHuman(visible),
          listJson: (visible) => visible.map(taskRow),
          listAgent: (visible) => buildTaskListPayload({ tasks: visible }),
          aiVariants: (visible) => [
            keyFieldsAiVariant({
              kind: "tasks-list",
              location: TASKS_LOCATION,
              description:
                "The visible task rows projected to title, status, project, priority and due date.",
              visible,
              project: (task) => ({
                id: task.id,
                title: task.title,
                status: task.status,
                project: task.projectName,
                priority: task.priority ?? null,
                due_date: task.dueDate || null,
              }),
            }),
          ],
        }}
      />
    </div>
  );
}
