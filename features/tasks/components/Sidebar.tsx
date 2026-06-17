"use client";

import React, { JSX } from "react";
import {
  Plus,
  X,
  Loader2,
  Inbox,
  AlertCircle,
  Layers,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { TaskFilterType } from "@/features/tasks/types";
import { selectProjects } from "@/features/tasks/redux/selectors";
import {
  selectNewProjectName,
  selectActiveProject,
  selectShowAllProjects,
  selectShowCompleted,
  selectIsCreatingProject,
  selectOperatingProjectId,
  selectTasksLoading,
  selectTaskFilter,
  setNewProjectName,
  setActiveProject,
  setShowAllProjects,
  setShowCompleted,
  setFilter,
} from "@/features/tasks/redux/taskUiSlice";
import {
  createProjectThunk,
  updateProjectThunk,
  deleteProjectThunk,
} from "@/features/tasks/redux/thunks";
import EditableProjectName from "./EditableProjectName";
import TaskScopeFilter from "./TaskScopeFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const Circle = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
  </svg>
);

function getFilterIcon(filterType: TaskFilterType) {
  switch (filterType) {
    case "all":
      return <Inbox size={16} />;
    case "incomplete":
      return <Circle size={16} />;
    case "overdue":
      return <AlertCircle size={16} />;
  }
}

export default function Sidebar(): JSX.Element {
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectProjects);
  const newProjectName = useAppSelector(selectNewProjectName);
  const activeProject = useAppSelector(selectActiveProject);
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const showCompleted = useAppSelector(selectShowCompleted);
  const isCreatingProject = useAppSelector(selectIsCreatingProject);
  const operatingProjectId = useAppSelector(selectOperatingProjectId);
  const loading = useAppSelector(selectTasksLoading);
  const filter = useAppSelector(selectTaskFilter);

  const handleFilterClick = (filterType: TaskFilterType) => {
    dispatch(setFilter(filterType));
    if (!showAllProjects && !activeProject) {
      dispatch(setShowAllProjects(true));
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await dispatch(createProjectThunk({ name: newProjectName }));
  };

  return (
    <div className="w-64 h-full bg-card border-r border-border flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-3 py-3 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">Tasks</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
            Views
          </h2>
          <div className="space-y-0.5">
            <button
              onClick={() => {
                dispatch(setShowAllProjects(true));
                dispatch(setFilter("all"));
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                showAllProjects && filter === "all"
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <Layers size={16} />
              <span>All Tasks</span>
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
            Filters
          </h2>
          <div className="space-y-0.5">
            {(["incomplete", "overdue"] as TaskFilterType[]).map(
              (filterType) => (
                <button
                  key={filterType}
                  onClick={() => handleFilterClick(filterType)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    filter === filterType
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  {getFilterIcon(filterType)}
                  <span className="capitalize">{filterType}</span>
                </button>
              ),
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
            Display
          </h2>
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted">
            <div className="flex items-center gap-2">
              {showCompleted ? (
                <Eye size={16} className="text-muted-foreground" />
              ) : (
                <EyeOff size={16} className="text-muted-foreground" />
              )}
              <span className="text-sm text-foreground">Show Completed</span>
            </div>
            <Switch
              checked={showCompleted}
              onCheckedChange={(v) => dispatch(setShowCompleted(!!v))}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase">
              Projects
            </h2>
          </div>

          <form onSubmit={handleAddProject} className="mb-2">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={newProjectName}
                onChange={(e) => dispatch(setNewProjectName(e.target.value))}
                placeholder="New project name..."
                disabled={isCreatingProject}
                className="flex-1 h-8 text-sm"
              />
              {(newProjectName.trim() || isCreatingProject) && (
                <Button
                  type="submit"
                  disabled={!newProjectName.trim() || isCreatingProject}
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 flex-shrink-0 rounded-full"
                >
                  {isCreatingProject ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                </Button>
              )}
            </div>
          </form>

          <div className="space-y-0.5">
            {projects.map((project) => {
              const isOperating = operatingProjectId === project.id;
              const isActive = activeProject === project.id && !showAllProjects;

              return (
                <div key={project.id} className="relative">
                  {isOperating && (
                    <div className="absolute inset-0 bg-card/50 backdrop-blur-sm z-10 rounded-md flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    </div>
                  )}
                  <div
                    onClick={() => {
                      if (!isOperating) {
                        dispatch(setActiveProject(project.id));
                        dispatch(setShowAllProjects(false));
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group cursor-pointer ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent"
                    } ${isOperating ? "opacity-60 pointer-events-none" : ""}`}
                  >
                    <EditableProjectName
                      name={project.name}
                      onSave={async (newName) => {
                        await dispatch(
                          updateProjectThunk({
                            projectId: project.id,
                            name: newName,
                          }),
                        );
                      }}
                    />
                    <span className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">
                      {project.tasks.length}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch(deleteProjectThunk(project.id));
                      }}
                      disabled={isOperating}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-destructive"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {projects.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No projects yet.
              <br />
              Create one above!
            </p>
          )}

          {projects.length === 0 && loading && (
            <div className="space-y-2 animate-pulse">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-8 bg-muted rounded" />
              ))}
            </div>
          )}
        </div>

        <div className="-mx-3">
          <TaskScopeFilter />
        </div>
      </div>
    </div>
  );
}
