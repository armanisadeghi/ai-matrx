"use client";

import { useState } from "react";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { isOpenStatus } from "@/features/tasks/constants/status";
import { Loader2, FolderKanban, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/cn";
import { useProjectsWithTasks } from "@/features/tasks/hooks/useTaskManager";
import type { ProjectWithTasks, DatabaseTask } from "@/features/tasks/types";
import { filterAndSortBySearch, matchesSearch } from "@ai-matrx/kit/search-scoring";
import { usePickerInputFocus } from "./usePickerInputFocus";
import {
  PickerEmpty,
  PickerRow,
  PickerSearchField,
  PickerSectionLabel,
  PickerView,
  PickerViewBody,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { ReadFailure } from "@ai-matrx/design-system";

interface TasksResourcePickerProps {
  onBack: () => void;
  onSelect: (
    selection:
      | { type: "task"; data: DatabaseTask }
      | { type: "project"; data: ProjectWithTasks },
  ) => void;
}

const ACTION_BUTTON_CLASS =
  "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium transition-colors pointer-coarse:h-10";

const CHIP_CLASS = "shrink-0 rounded-full px-1.5 py-0.5 text-xs";

const getPriorityColor = (priority?: "low" | "medium" | "high" | null) => {
  if (!priority) return "bg-muted text-muted-foreground";
  switch (priority) {
    case "high":
      return "bg-destructive/15 text-destructive-ink";
    case "medium":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "low":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
  }
};

/**
 * The Tasks view of the canonical resource picker: projects, then a project's
 * tasks. Back goes up one level; the open project shows as a section label
 * carrying the completed toggle and the bulk actions.
 */
export function TasksResourcePicker({ onBack, onSelect }: TasksResourcePickerProps) {
  const { projects, loading, error: projectsError, refresh } = useProjectsWithTasks();
  const searchInputRef = usePickerInputFocus();
  const [selectedProject, setSelectedProject] = useState<ProjectWithTasks | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const hasQuery = searchQuery.trim().length > 0;

  // Keep original order; match on project name or any nested task title/description.
  const filteredProjects = !hasQuery
    ? projects
    : projects.filter((project) => {
        if (matchesSearch(project, searchQuery, [{ get: (p) => p.name, weight: "title" }])) {
          return true;
        }
        return project.tasks?.some((task) =>
          matchesSearch(task, searchQuery, [
            { get: (t) => t.title, weight: "title" },
            { get: (t) => t.description, weight: "body" },
          ]),
        );
      });

  let filteredTasks: DatabaseTask[] = [];
  if (selectedProject) {
    filteredTasks = selectedProject.tasks || [];
    if (!showCompleted) {
      filteredTasks = filteredTasks.filter((task) => isOpenStatus(task.status));
    }
    if (hasQuery) {
      filteredTasks = filterAndSortBySearch(filteredTasks, searchQuery, [
        { get: (t) => t.title, weight: "title" },
        { get: (t) => t.description, weight: "body" },
      ]);
    }
  }

  const getProjectTaskCount = (project: ProjectWithTasks) => {
    const tasks = project.tasks || [];
    const incomplete = tasks.filter((t) => isOpenStatus(t.status)).length;
    return { incomplete, total: tasks.length };
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const selectAllTasks = () => setSelectedTaskIds(new Set(filteredTasks.map((t) => t.id)));
  const clearAllSelections = () => setSelectedTaskIds(new Set());

  const addSelectedTasks = () => {
    filteredTasks
      .filter((t) => selectedTaskIds.has(t.id))
      .forEach((task) => onSelect({ type: "task", data: task }));
    setSelectedTaskIds(new Set());
  };

  const openProject = (project: ProjectWithTasks) => {
    setSelectedProject(project);
    setExpandedTaskId(null);
    setSelectedTaskIds(new Set());
  };

  const closeProject = () => {
    setSelectedProject(null);
    setExpandedTaskId(null);
    setSelectedTaskIds(new Set());
  };

  const formatDue = (due: string, withYear: boolean) =>
    new Date(due).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });

  const renderTask = (task: DatabaseTask) => {
    const isCompleted = task.status === "completed";
    const isOverdue = !!task.due_date && new Date(task.due_date) < new Date() && !isCompleted;
    const isExpanded = expandedTaskId === task.id;
    const isSelected = selectedTaskIds.has(task.id);
    const dueClass = isOverdue ? "bg-destructive/15 text-destructive-ink" : "bg-muted text-muted-foreground";

    return (
      <div
        key={task.id}
        className={cn("rounded-lg", isSelected && "bg-primary/5", isExpanded && !isSelected && "bg-muted/40")}
      >
        <div className="flex items-center gap-1">
          <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center pointer-coarse:h-11 pointer-coarse:w-11">
            <Checkbox
              size="md"
              checked={isSelected}
              onCheckedChange={() => toggleTaskSelection(task.id)}
              aria-label={task.title}
            />
          </label>
          <div className="min-w-0 flex-1">
            <PickerRow
              label={<span className={cn(isCompleted && "text-muted-foreground")}>{task.title}</span>}
              secondary={
                !isExpanded && (task.priority || task.due_date || task.description) ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    {task.priority && (
                      <span className={cn(CHIP_CLASS, getPriorityColor(task.priority))}>{task.priority}</span>
                    )}
                    {task.due_date && (
                      <span className={cn(CHIP_CLASS, dueClass)}>{formatDue(task.due_date, false)}</span>
                    )}
                    {task.description && <span className="min-w-0 truncate">{task.description}</span>}
                  </span>
                ) : undefined
              }
              trailing={
                <span
                  className={cn(
                    CHIP_CLASS,
                    "font-medium",
                    isCompleted
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                  )}
                >
                  {task.status}
                </span>
              }
              onClick={() => onSelect({ type: "task", data: task })}
            />
          </div>
          <button
            type="button"
            onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11"
            aria-label={isExpanded ? "Hide details" : "Show details"}
            aria-expanded={isExpanded}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
          </button>
        </div>
        {isExpanded && (
          <div className="space-y-2 pb-2 pl-11 pr-2">
            {task.description && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-2.5">
                <div className="text-sm leading-relaxed text-foreground"><RichContent source={task.description ?? ""} level="standard" /></div>
              </div>
            )}
            {(task.priority || task.due_date) && (
              <div className="flex flex-wrap items-center gap-1">
                {task.priority && (
                  <span className={cn(CHIP_CLASS, getPriorityColor(task.priority))}>
                    {task.priority} priority
                  </span>
                )}
                {task.due_date && (
                  <span className={cn(CHIP_CLASS, dueClass)}>Due: {formatDue(task.due_date, true)}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const projectActions = selectedProject ? (
    <div className="flex shrink-0 items-center gap-0.5">
      <label className="flex h-8 cursor-pointer items-center gap-1.5 px-1.5 pointer-coarse:h-10">
        <Checkbox
          checked={showCompleted}
          onCheckedChange={(checked) => {
            setShowCompleted(checked === true);
            setExpandedTaskId(null);
          }}
        />
        <span className="text-xs text-muted-foreground">Completed</span>
      </label>
      {selectedTaskIds.size > 0 ? (
        <>
          <button
            type="button"
            className={cn(ACTION_BUTTON_CLASS, "text-muted-foreground hover:bg-accent hover:text-foreground")}
            onClick={clearAllSelections}
          >
            Clear
          </button>
          <button
            type="button"
            className={cn(ACTION_BUTTON_CLASS, "text-primary-ink hover:bg-primary/10")}
            onClick={addSelectedTasks}
          >
            Add ({selectedTaskIds.size})
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={cn(ACTION_BUTTON_CLASS, "text-muted-foreground hover:bg-accent hover:text-foreground")}
            onClick={selectAllTasks}
          >
            Select all
          </button>
          <button
            type="button"
            className={cn(ACTION_BUTTON_CLASS, "text-primary-ink hover:bg-primary/10")}
            onClick={() => onSelect({ type: "project", data: selectedProject })}
          >
            Add project
          </button>
        </>
      )}
    </div>
  ) : null;

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (projectsError && projects.length === 0) {
      return (
        <ReadFailure error={projectsError} what="your projects and tasks" onRetry={() => void refresh()} />
      );
    }
    if (selectedProject) {
      if (filteredTasks.length === 0) {
        return <PickerEmpty>{hasQuery ? "No tasks found" : "No tasks in this project"}</PickerEmpty>;
      }
      return <div>{filteredTasks.map(renderTask)}</div>;
    }
    if (filteredProjects.length === 0) {
      return <PickerEmpty>{hasQuery ? "No projects found" : "No projects yet"}</PickerEmpty>;
    }
    return (
      <div>
        {filteredProjects.map((project) => {
          const { incomplete, total } = getProjectTaskCount(project);
          return (
            <PickerRow
              key={project.id}
              icon={FolderKanban}
              iconClassName="text-blue-600 dark:text-blue-500"
              label={project.name}
              secondary={`${incomplete > 0 ? `${incomplete} pending` : "All complete"} · ${total} total`}
              chevron
              onClick={() => openProject(project)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <PickerView>
      <ResourcePickerSubViewHeader
        onBack={selectedProject ? closeProject : onBack}
        search={
          <PickerSearchField
            ref={searchInputRef}
            placeholder={selectedProject ? "Search tasks" : "Search projects and tasks"}
            value={searchQuery}
            onChange={(value) => {
              setSearchQuery(value);
              setExpandedTaskId(null);
            }}
          />
        }
      />
      {selectedProject && (
        <div className="shrink-0 border-b border-border px-1.5 pb-1">
          <PickerSectionLabel action={projectActions}>
            {selectedProject.name}
          </PickerSectionLabel>
        </div>
      )}
      <PickerViewBody>{renderBody()}</PickerViewBody>
    </PickerView>
  );
}
