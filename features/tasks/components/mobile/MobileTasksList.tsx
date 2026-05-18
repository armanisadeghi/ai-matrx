"use client";

import React, { useState } from "react";
import {
  ChevronRight,
  Plus,
  MoreVertical,
  Search,
  X,
  Loader2,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFilteredTasks,
  selectProjects,
} from "@/features/tasks/redux/selectors";
import {
  selectNewTaskTitle,
  selectIsCreatingTask,
  selectSearchQuery,
  selectShowAllProjects,
  selectActiveProject,
  setNewTaskTitle,
  setSearchQuery,
} from "@/features/tasks/redux/taskUiSlice";
import {
  createTaskThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import MobileFilterMenu from "./MobileFilterMenu";
import MobileProjectSelector from "./MobileProjectSelector";
import { ScopeTagsDisplay } from "@/features/agent-context/components/ScopeTagsDisplay";
import { ActiveScopeFilterChips } from "../TaskScopeFilter";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface MobileTasksListProps {
  onTaskSelect: (taskId: string) => void;
}

export default function MobileTasksList({
  onTaskSelect,
}: MobileTasksListProps) {
  const dispatch = useAppDispatch();
  const filteredTasks = useAppSelector(selectFilteredTasks);
  const projects = useAppSelector(selectProjects);
  const newTaskTitle = useAppSelector(selectNewTaskTitle);
  const isCreatingTask = useAppSelector(selectIsCreatingTask);
  const searchQuery = useAppSelector(selectSearchQuery);
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const activeProject = useAppSelector(selectActiveProject);
  const orgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [selectedProjectForTask, setSelectedProjectForTask] = useState<
    string | null
  >(activeProject || null);

  const canShowTasks = activeProject || showAllProjects;

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const defaultScopeIds = Object.values(scopeSelections ?? {}).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    await dispatch(
      createTaskThunk({
        title: newTaskTitle,
        projectId: selectedProjectForTask ?? null,
        organizationId: orgId,
        scopeIds: defaultScopeIds,
      }),
    );
    setShowQuickAdd(false);
  };

  const handleTaskToggle = (
    _projectId: string,
    taskId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    dispatch(toggleTaskCompleteThunk({ taskId }));
  };

  const currentProjectName = activeProject
    ? projects.find((p) => p.id === activeProject)?.name
    : "All Tasks";

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h1 className="text-2xl font-bold text-foreground">
            {currentProjectName}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowQuickAdd(!showQuickAdd)}
              className="h-7 w-7 rounded-full"
            >
              <Plus size={16} />
            </Button>
            <MobileFilterMenu />
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => dispatch(setSearchQuery(e.target.value))}
              placeholder="Search tasks..."
              className="pl-9 pr-9 h-10 bg-muted/50 text-base"
              style={{ fontSize: "16px" }}
            />
            {searchQuery && (
              <button
                onClick={() => dispatch(setSearchQuery(""))}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Quick Add (Expandable) */}
        {showQuickAdd && (
          <div className="px-4 pb-2 animate-in slide-in-from-top-2 duration-200">
            <form onSubmit={handleAddTask} className="space-y-2">
              <Input
                type="text"
                value={newTaskTitle}
                onChange={(e) => dispatch(setNewTaskTitle(e.target.value))}
                placeholder="New task..."
                autoFocus
                onFocus={(e) => {
                  // Scroll into view when keyboard appears on mobile
                  setTimeout(() => {
                    e.target.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }, 300);
                }}
                className="h-10 text-base"
                style={{ fontSize: "16px" }}
              />
              <div className="flex items-center gap-2">
                <Sheet
                  open={showProjectSelector}
                  onOpenChange={setShowProjectSelector}
                >
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 justify-start"
                    >
                      <span className="truncate">
                        {selectedProjectForTask
                          ? projects.find(
                              (p) => p.id === selectedProjectForTask,
                            )?.name
                          : "Select Project"}
                      </span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-[50vh]">
                    <SheetHeader className="sr-only">
                      <SheetTitle>Select Project</SheetTitle>
                      <SheetDescription>
                        Choose a project for this task
                      </SheetDescription>
                    </SheetHeader>
                    <MobileProjectSelector
                      selectedProjectId={selectedProjectForTask}
                      onSelectProject={(projectId) => {
                        setSelectedProjectForTask(projectId);
                        setShowProjectSelector(false);
                      }}
                    />
                  </SheetContent>
                </Sheet>
                <Button
                  type="submit"
                  disabled={
                    !newTaskTitle.trim() ||
                    isCreatingTask ||
                    !selectedProjectForTask
                  }
                  size="sm"
                >
                  {isCreatingTask ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Active scope-filter chips */}
      <ActiveScopeFilterChips />

      {/* Task List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {!canShowTasks ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                Select a project from the menu to get started
              </p>
            </div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                {searchQuery
                  ? "No tasks found"
                  : "No tasks yet. Create one above!"}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredTasks.map((task) => {
              const isPastDue =
                task.dueDate &&
                task.dueDate < new Date().toISOString().split("T")[0] &&
                !task.completed;

              return (
                <div
                  key={task.id}
                  onClick={() => onTaskSelect(task.id)}
                  className="flex items-center gap-3 p-4 active:bg-muted/50 transition-colors cursor-pointer"
                >
                  {/* Checkbox */}
                  <div
                    onClick={(e) =>
                      handleTaskToggle(task.projectId, task.id, e)
                    }
                  >
                    <Checkbox
                      checked={task.completed}
                      className="pointer-events-none"
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`text-base font-medium mb-1 ${
                        task.completed
                          ? "line-through text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {task.projectName && showAllProjects && (
                        <span className="text-primary">
                          ● {task.projectName}
                        </span>
                      )}
                      {task.dueDate && (
                        <span
                          className={
                            isPastDue ? "text-destructive font-medium" : ""
                          }
                        >
                          {new Date(task.dueDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                      {task.priority && (
                        <span className="capitalize">{task.priority}</span>
                      )}
                    </div>
                    <ScopeTagsDisplay
                      entityType="task"
                      entityId={task.id}
                      className="mt-1.5"
                    />
                  </div>

                  {/* Chevron */}
                  <ChevronRight
                    size={20}
                    className="text-muted-foreground flex-shrink-0"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
