"use client";

import React from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CircleDashed,
  Folder,
  ListFilter,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFilteredTasks,
  UNASSIGNED_PROJECT_ID,
} from "@/features/tasks/redux/selectors";
import {
  selectSelectedTaskId,
  setSelectedTaskId,
} from "@/features/tasks/redux/taskUiSlice";
import { toggleTaskCompleteThunk } from "@/features/tasks/redux/thunks";
import { TASK_LABEL_OPTIONS } from "@/features/tasks/services/taskService";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils/cn";
import {
  compareTimestamps,
  formatAbsoluteDate,
  formatReadableDate,
  formatRelativeTime,
  toEpochMs,
} from "@/utils/datetime";
import type { TaskWithProject } from "@/features/tasks/types";

type SortKey =
  | "status"
  | "title"
  | "project"
  | "priority"
  | "dueDate"
  | "updated";

type UpdatedFilter =
  | "any"
  | "hour"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";

type DueFilter = "any" | "overdue" | "today" | "week" | "none";

type TaskColumnFilters = {
  status: "any" | "open" | "completed";
  title: string;
  projectId: string;
  priority: "any" | "high" | "medium" | "low" | "none";
  due: DueFilter;
  updated: UpdatedFilter;
};

const EMPTY_COLUMN_FILTERS: TaskColumnFilters = {
  status: "any",
  title: "",
  projectId: "",
  priority: "any",
  due: "any",
  updated: "any",
};

const UPDATED_FILTER_OPTIONS: ReadonlyArray<{
  value: UpdatedFilter;
  label: string;
}> = [
  { value: "any", label: "Any time" },
  { value: "hour", label: "Last hour" },
  { value: "today", label: "Last 24 hours" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "quarter", label: "Last 90 days" },
  { value: "year", label: "Last year" },
];

const DUE_FILTER_OPTIONS: ReadonlyArray<{ value: DueFilter; label: string }> = [
  { value: "any", label: "Any due date" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due within 7 days" },
  { value: "none", label: "No due date" },
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

function hasActiveColumnFilters(filters: TaskColumnFilters): boolean {
  return (
    filters.status !== "any" ||
    filters.title.trim().length > 0 ||
    filters.projectId.length > 0 ||
    filters.priority !== "any" ||
    filters.due !== "any" ||
    filters.updated !== "any"
  );
}

function passesUpdatedFilter(
  updatedAt: string | null | undefined,
  filter: UpdatedFilter,
): boolean {
  if (filter === "any") return true;
  const updated = toEpochMs(updatedAt);
  if (Number.isNaN(updated)) return false;
  const age = Date.now() - updated;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  switch (filter) {
    case "hour":
      return age <= hour;
    case "today":
      return age <= day;
    case "week":
      return age <= 7 * day;
    case "month":
      return age <= 30 * day;
    case "quarter":
      return age <= 90 * day;
    case "year":
      return age <= 365 * day;
    default:
      return true;
  }
}

function passesDueFilter(
  task: TaskWithProject,
  filter: DueFilter,
  todayStr: string,
  weekStr: string,
): boolean {
  if (filter === "any") return true;
  if (filter === "none") return !task.dueDate;
  if (!task.dueDate) return false;
  if (filter === "overdue") {
    return !task.completed && task.dueDate < todayStr;
  }
  if (filter === "today") return task.dueDate === todayStr;
  if (filter === "week") {
    return task.dueDate >= todayStr && task.dueDate <= weekStr;
  }
  return true;
}

function ColumnFilterButton({
  active,
  label,
  children,
  align = "start",
}: {
  active: boolean;
  label: string;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Filter ${label}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "rounded p-0.5 transition-colors",
            active
              ? "text-primary hover:text-primary/80"
              : "text-muted-foreground/40 hover:text-muted-foreground",
          )}
        >
          <ListFilter className={cn("h-3 w-3", active && "fill-primary/20")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        className="w-auto p-3"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function TextColumnFilter({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-[200px]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Filter: {label}
        </p>
        {value.trim().length > 0 && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
          >
            clear
          </button>
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}

function OptionColumnFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-[180px]">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Filter: {label}
      </p>
      <div className="flex flex-col gap-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded px-2 py-1 text-left text-xs hover:bg-accent",
              value === opt.value && "bg-accent font-medium",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
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
  const selectedTaskId = useAppSelector(selectSelectedTaskId);

  const [sortKey, setSortKey] = React.useState<SortKey>("updated");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [columnFilters, setColumnFilters] =
    React.useState<TaskColumnFilters>(EMPTY_COLUMN_FILTERS);

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

  const projectOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const task of tasks) {
      if (!task.projectId) continue;
      seen.set(task.projectId, task.projectName);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const patchFilters = (patch: Partial<TaskColumnFilters>) => {
    setColumnFilters((prev) => ({ ...prev, ...patch }));
  };

  const filtered = React.useMemo(() => {
    const titleQ = columnFilters.title.trim().toLowerCase();
    return tasks.filter((task) => {
      if (columnFilters.status === "open" && task.completed) return false;
      if (columnFilters.status === "completed" && !task.completed) return false;
      if (titleQ && !task.title.toLowerCase().includes(titleQ)) return false;
      if (
        columnFilters.projectId &&
        task.projectId !== columnFilters.projectId
      ) {
        return false;
      }
      if (columnFilters.priority !== "any") {
        const key = task.priority ?? "none";
        if (key !== columnFilters.priority) return false;
      }
      if (!passesDueFilter(task, columnFilters.due, todayStr, weekStr)) {
        return false;
      }
      if (!passesUpdatedFilter(task.updatedAt, columnFilters.updated)) {
        return false;
      }
      return true;
    });
  }, [tasks, columnFilters, todayStr, weekStr]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "status":
          return (
            (Number(a.completed) - Number(b.completed)) * dir ||
            a.title.localeCompare(b.title)
          );
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "project":
          return (
            (a.projectName ?? "").localeCompare(b.projectName ?? "") * dir ||
            a.title.localeCompare(b.title)
          );
        case "priority": {
          const ak = PRIORITY_ORDER[a.priority ?? "__none__"] ?? 99;
          const bk = PRIORITY_ORDER[b.priority ?? "__none__"] ?? 99;
          return (ak - bk) * dir || a.title.localeCompare(b.title);
        }
        case "dueDate": {
          const ad = a.dueDate || "9999-12-31";
          const bd = b.dueDate || "9999-12-31";
          return ad.localeCompare(bd) * dir || a.title.localeCompare(b.title);
        }
        case "updated":
          return (
            compareTimestamps(a.updatedAt, b.updatedAt) * dir ||
            a.title.localeCompare(b.title)
          );
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(
        key === "updated" || key === "priority" || key === "status"
          ? "desc"
          : "asc",
      );
    }
  };

  const filtersActive = hasActiveColumnFilters(columnFilters);

  const ColumnHead = ({
    k,
    children,
    className,
    align = "left",
    filter,
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
    align?: "left" | "right";
    filter: React.ReactNode;
  }) => (
    <TableHead className={className}>
      <div
        className={cn(
          "inline-flex items-center gap-0.5",
          align === "right" && "justify-end w-full",
        )}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground transition-colors text-xs",
            align === "right" && "justify-end",
          )}
        >
          {children}
          {sortKey === k ? (
            sortDir === "asc" ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )
          ) : (
            <ChevronsUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
        {filter}
      </div>
    </TableHead>
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {filtersActive && (
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-2 py-1">
          <span className="text-[11px] text-muted-foreground">
            Column filters active
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setColumnFilters(EMPTY_COLUMN_FILTERS)}
          >
            Clear all
          </Button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <ColumnHead
                k="status"
                className="w-10"
                filter={
                  <ColumnFilterButton
                    active={columnFilters.status !== "any"}
                    label="status"
                  >
                    <OptionColumnFilter
                      label="Status"
                      value={columnFilters.status}
                      options={[
                        { value: "any", label: "All" },
                        { value: "open", label: "Open" },
                        { value: "completed", label: "Completed" },
                      ]}
                      onChange={(status) => patchFilters({ status })}
                    />
                  </ColumnFilterButton>
                }
              >
                <span className="sr-only">Status</span>
              </ColumnHead>
              <ColumnHead
                k="title"
                filter={
                  <ColumnFilterButton
                    active={columnFilters.title.trim().length > 0}
                    label="title"
                  >
                    <TextColumnFilter
                      label="Task"
                      value={columnFilters.title}
                      placeholder="Contains…"
                      onChange={(title) => patchFilters({ title })}
                    />
                  </ColumnFilterButton>
                }
              >
                Task
              </ColumnHead>
              <ColumnHead
                k="project"
                className="min-w-[120px]"
                filter={
                  <ColumnFilterButton
                    active={columnFilters.projectId.length > 0}
                    label="project"
                  >
                    <div className="flex flex-col gap-2 w-[200px]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Filter: Project
                        </p>
                        {columnFilters.projectId.length > 0 && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => patchFilters({ projectId: "" })}
                          >
                            clear
                          </button>
                        )}
                      </div>
                      <Select
                        value={columnFilters.projectId || "__all__"}
                        onValueChange={(v) =>
                          patchFilters({
                            projectId: v === "__all__" ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="All projects" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All projects</SelectItem>
                          {projectOptions.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </ColumnFilterButton>
                }
              >
                Project
              </ColumnHead>
              <ColumnHead
                k="priority"
                className="w-24"
                filter={
                  <ColumnFilterButton
                    active={columnFilters.priority !== "any"}
                    label="priority"
                  >
                    <OptionColumnFilter
                      label="Priority"
                      value={columnFilters.priority}
                      options={[
                        { value: "any", label: "All" },
                        { value: "high", label: "High" },
                        { value: "medium", label: "Medium" },
                        { value: "low", label: "Low" },
                        { value: "none", label: "None" },
                      ]}
                      onChange={(priority) => patchFilters({ priority })}
                    />
                  </ColumnFilterButton>
                }
              >
                Priority
              </ColumnHead>
              <ColumnHead
                k="dueDate"
                className="w-28"
                filter={
                  <ColumnFilterButton
                    active={columnFilters.due !== "any"}
                    label="due date"
                  >
                    <OptionColumnFilter
                      label="Due"
                      value={columnFilters.due}
                      options={DUE_FILTER_OPTIONS}
                      onChange={(due) => patchFilters({ due })}
                    />
                  </ColumnFilterButton>
                }
              >
                Due
              </ColumnHead>
              <ColumnHead
                k="updated"
                className="w-32"
                filter={
                  <ColumnFilterButton
                    active={columnFilters.updated !== "any"}
                    label="updated"
                  >
                    <OptionColumnFilter
                      label="Updated"
                      value={columnFilters.updated}
                      options={UPDATED_FILTER_OPTIONS}
                      onChange={(updated) => patchFilters({ updated })}
                    />
                  </ColumnFilterButton>
                }
              >
                Updated
              </ColumnHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr:nth-child(even)]:bg-muted/30">
            {sorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No tasks match these filters.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((task) => {
                const isSelected = selectedTaskId === task.id;
                const isPastDue =
                  !!task.dueDate && task.dueDate < todayStr && !task.completed;
                const labels = (task.settings?.labels ?? []) as string[];

                return (
                  <TableRow
                    key={task.id}
                    className={cn(
                      "cursor-pointer",
                      isSelected && "bg-primary/[0.08] hover:bg-primary/[0.1]",
                    )}
                    onClick={() => dispatch(setSelectedTaskId(task.id))}
                  >
                    <TableCell className="py-1.5 w-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch(
                            toggleTaskCompleteThunk({ taskId: task.id }),
                          );
                        }}
                        className="text-muted-foreground/70 hover:text-primary transition-colors"
                        title={
                          task.completed ? "Mark incomplete" : "Mark complete"
                        }
                      >
                        {task.completed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <CircleDashed className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="py-1.5 max-w-[200px]">
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "block text-[13px] truncate",
                            task.completed
                              ? "line-through text-muted-foreground"
                              : "font-medium text-foreground",
                          )}
                        >
                          {task.title}
                        </span>
                        {labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {labels.slice(0, 2).map((label) => (
                              <Badge
                                key={label}
                                variant="outline"
                                className="h-4 px-1 text-[9px] font-normal"
                              >
                                {LABEL_BY_VALUE[label] ?? label}
                              </Badge>
                            ))}
                            {labels.length > 2 && (
                              <span className="text-[9px] text-muted-foreground">
                                +{labels.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1 min-w-0 max-w-[160px]">
                        <Folder className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {task.projectId === UNASSIGNED_PROJECT_ID
                            ? "Unassigned"
                            : (task.projectName ?? "—")}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
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
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-1.5 text-xs whitespace-nowrap",
                        isPastDue
                          ? "text-destructive font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {task.dueDate
                        ? formatReadableDate(task.dueDate, {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                      <span title={formatAbsoluteDate(task.updatedAt)}>
                        {formatRelativeTime(task.updatedAt, { style: "long" })}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
