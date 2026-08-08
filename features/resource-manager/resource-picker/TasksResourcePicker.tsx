"use client";

import React, { useState, useMemo } from "react";
import { isOpenStatus } from "@/features/tasks/constants/status";
import {
  ChevronRight,
  Search,
  Loader2,
  CheckSquare,
  Circle,
  CheckCircle2,
  FolderKanban,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useProjectsWithTasks } from "@/features/tasks/hooks/useTaskManager";
import type { ProjectWithTasks, DatabaseTask } from "@/features/tasks/types";
import { filterAndSortBySearch, matchesSearch } from "@/utils/search-scoring";
import { usePickerInputFocus } from "./usePickerInputFocus";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";

interface TasksResourcePickerProps {
  onBack: () => void;
  onSelect: (selection: {
    type: "task" | "project";
    data: DatabaseTask | ProjectWithTasks;
  }) => void;
}

export function TasksResourcePicker({
  onBack,
  onSelect,
}: TasksResourcePickerProps) {
  const { projects, loading } = useProjectsWithTasks();
  const searchInputRef = usePickerInputFocus();
  const [selectedProject, setSelectedProject] =
    useState<ProjectWithTasks | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set(),
  );

  // Filter projects by search — keep original order; match on project name or any nested task title/description.
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    return projects.filter((project) => {
      if (
        matchesSearch(project, searchQuery, [
          { get: (p) => p.name, weight: "title" },
        ])
      ) {
        return true;
      }
      return project.tasks?.some((task) =>
        matchesSearch(task, searchQuery, [
          { get: (t) => t.title, weight: "title" },
          { get: (t) => t.description, weight: "body" },
        ]),
      );
    });
  }, [projects, searchQuery]);

  // Filter tasks by search and completion status
  const filteredTasks = useMemo(() => {
    if (!selectedProject) return [];
    let tasks = selectedProject.tasks || [];

    // Filter by completion status
    if (!showCompleted) {
      tasks = tasks.filter((task) => isOpenStatus(task.status));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      tasks = filterAndSortBySearch(tasks, searchQuery, [
        { get: (t) => t.title, weight: "title" },
        { get: (t) => t.description, weight: "body" },
      ]);
    }

    return tasks;
  }, [selectedProject, searchQuery, showCompleted]);

  // Count tasks per project (incomplete/total)
  const getProjectTaskCount = (project: ProjectWithTasks) => {
    const tasks = project.tasks || [];
    const incomplete = tasks.filter((t) => isOpenStatus(t.status)).length;
    const total = tasks.length;
    return { incomplete, total };
  };

  // Get priority badge color
  const getPriorityColor = (priority?: "low" | "medium" | "high" | null) => {
    if (!priority)
      return "bg-muted text-muted-foreground";
    switch (priority) {
      case "high":
        return "bg-destructive/15 text-destructive";
      case "medium":
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
      case "low":
        return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
    }
  };

  // Reset expanded task when project or search changes
  React.useEffect(() => {
    setExpandedTaskId(null);
  }, [selectedProject, searchQuery, showCompleted]);

  // Reset selections when changing projects
  React.useEffect(() => {
    setSelectedTaskIds(new Set());
  }, [selectedProject]);

  // Toggle task selection
  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  // Select all filtered tasks
  const selectAllTasks = () => {
    const allIds = new Set(filteredTasks.map((t) => t.id));
    setSelectedTaskIds(allIds);
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedTaskIds(new Set());
  };

  // Add selected tasks
  const addSelectedTasks = () => {
    const tasks = filteredTasks.filter((t) => selectedTaskIds.has(t.id));
    tasks.forEach((task) => {
      onSelect({ type: "task", data: task });
    });
    setSelectedTaskIds(new Set());
  };

  return (
    <div className="flex flex-col max-h-[min(460px,70dvh)]">
      {/* Header */}
      <ResourcePickerSubViewHeader
        title={selectedProject ? selectedProject.name : "Tasks"}
        onBack={selectedProject ? () => setSelectedProject(null) : onBack}
        actions={
          selectedProject ? (
            <>
              <label className="flex shrink-0 items-center gap-1 cursor-pointer">
                <Checkbox
                  checked={showCompleted}
                  onCheckedChange={(checked) =>
                    setShowCompleted(checked === true)
                  }
                  className="h-3 w-3"
                />
                <span className="text-[10px] text-muted-foreground">
                  Completed
                </span>
              </label>
              {selectedTaskIds.size > 0 ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-muted-foreground hover:bg-muted/60"
                    onClick={clearAllSelections}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                    onClick={addSelectedTasks}
                  >
                    Add ({selectedTaskIds.size})
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-muted-foreground hover:bg-muted/60"
                    onClick={selectAllTasks}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                    onClick={() =>
                      onSelect({ type: "project", data: selectedProject })
                    }
                  >
                    Add Project
                  </Button>
                </>
              )}
            </>
          ) : undefined
        }
      />

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs pl-7 pr-2 bg-background border-border"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : selectedProject ? (
          // Show tasks in project
          <div className="p-1">
            {filteredTasks.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                {searchQuery ? "No tasks found" : "No tasks in this project"}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredTasks.map((task) => {
                  const isCompleted = task.status === "completed";
                  const isOverdue =
                    task.due_date &&
                    new Date(task.due_date) < new Date() &&
                    !isCompleted;
                  const isExpanded = expandedTaskId === task.id;
                  const isSelected = selectedTaskIds.has(task.id);

                  return (
                    <div
                      key={task.id}
                      className={`rounded overflow-hidden border transition-all ${
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-transparent hover:border-border"
                      }`}
                    >
                      <div className="flex items-start gap-2 px-2 py-1.5">
                        {/* Checkbox for multi-select */}
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleTaskSelection(task.id)}
                          className="mt-0.5 flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />

                        {/* Task content - clickable to immediately add */}
                        <button
                          onClick={() => onSelect({ type: "task", data: task })}
                          className="flex-1 text-left hover:bg-muted/60 transition-colors rounded px-1 py-0.5 -mx-1 -my-0.5 min-w-0"
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className={`text-xs font-medium truncate ${
                                isCompleted
                                  ? "text-muted-foreground"
                                  : "text-foreground"
                              }`}
                            >
                              {task.title}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                isCompleted
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                              }`}
                            >
                              {task.status}
                            </span>
                          </div>
                          {!isExpanded && task.description && (
                            <div className="text-[10px] text-muted-foreground line-clamp-1 leading-tight mb-1">
                              {task.description}
                            </div>
                          )}
                          {!isExpanded && (
                            <div className="flex gap-1 flex-wrap items-center">
                              {task.priority && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${getPriorityColor(task.priority)}`}
                                >
                                  {task.priority}
                                </span>
                              )}
                              {task.due_date && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                    isOverdue
                                      ? "bg-destructive/15 text-destructive"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {new Date(task.due_date).toLocaleDateString(
                                    "en-US",
                                    { month: "short", day: "numeric" },
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </button>

                        {/* Chevron - toggles expansion */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTaskId(isExpanded ? null : task.id);
                          }}
                          className="flex-shrink-0 p-1 -mr-1 hover:bg-muted/60 rounded transition-colors"
                          title={isExpanded ? "Hide details" : "Show details"}
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="px-2 pb-2 pl-9 space-y-2 bg-background/50">
                          {task.description && (
                            <div className="max-h-24 overflow-y-auto scrollbar-thin rounded bg-background p-2 border-border">
                              <div className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">
                                {task.description}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-1 flex-wrap items-center">
                            {task.priority && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full ${getPriorityColor(task.priority)}`}
                              >
                                {task.priority} priority
                              </span>
                            )}
                            {task.due_date && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                  isOverdue
                                    ? "bg-destructive/15 text-destructive"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                Due:{" "}
                                {new Date(task.due_date).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          // Show projects
          <div className="p-1">
            {filteredProjects.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                {searchQuery ? "No projects found" : "No projects yet"}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredProjects.map((project) => {
                  const { incomplete, total } = getProjectTaskCount(project);

                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 transition-colors group"
                    >
                      <FolderKanban className="w-4 h-4 flex-shrink-0 text-blue-600 dark:text-blue-500" />
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {project.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {incomplete > 0
                            ? `${incomplete} pending`
                            : "All complete"}{" "}
                          · {total} total
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
