'use client';

import React, { useState } from 'react';
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { isOpenStatus } from "@/features/tasks/constants/status";
import { ChevronDown, ChevronRight, FolderOpen, CheckSquare } from 'lucide-react';
import { useAppSelector } from '@/lib/redux/hooks';
import { selectProjects } from '@/features/tasks/redux/selectors';
import {
  selectTaskFilter,
  selectShowCompleted,
  selectTasksLoading,
  selectSortBy,
} from '@/features/tasks/redux/taskUiSlice';
import CompactTaskItem from './CompactTaskItem';
import { ActiveScopeFilterChips } from './TaskScopeFilter';
import { sortTasks } from '../utils/taskSorting';
import type { Project, Task, TaskSortConfig, TaskWithProject } from '../types';

interface AllTasksViewProps {
  selectedTaskId: string | null;
  onTaskSelect: (taskId: string) => void;
  onTaskToggle: (projectId: string, taskId: string) => void;
}

export default function AllTasksView({ selectedTaskId, onTaskSelect, onTaskToggle }: AllTasksViewProps) {
  const projects = useAppSelector(selectProjects);
  const filter = useAppSelector(selectTaskFilter);
  const showCompleted = useAppSelector(selectShowCompleted);
  const loading = useAppSelector(selectTasksLoading);
  const sortBy = useAppSelector(selectSortBy);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  // Show loading state during initial fetch
  if (loading && projects.length === 0) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(3)].map((_, projectIndex) => (
          <div key={projectIndex} className="bg-card rounded-lg border border-border">
            <div className="p-3 flex items-center gap-3">
              <div className="w-5 h-5 bg-muted rounded" />
              <div className="h-6 bg-muted rounded w-1/4" />
            </div>
            <div className="p-3 space-y-2 border-t border-border">
              {[...Array(2)].map((_, taskIndex) => (
                <div key={taskIndex} className="h-16 bg-muted rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const toggleProjectCollapse = (projectId: string) => {
    setCollapsedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  // Filter tasks based on current filter and showCompleted setting
  const getFilteredTasksForProject = (project: Project) => {
    // Local-date string — toISOString() shifts UTC+ users to yesterday.
    const todayStr = new Date().toLocaleDateString('sv-SE');

    let tasks: Task[] = project.tasks;

    // Hide closed tasks (completed/cancelled/dismissed) unless showing done
    if (!showCompleted) {
      tasks = tasks.filter((task) => isOpenStatus(task.status));
    }

    let filteredTasks: Task[];
    switch (filter) {
      case 'incomplete':
        filteredTasks = tasks.filter((task) => !task.completed);
        break;
      case 'overdue':
        filteredTasks = tasks.filter((task) =>
          !task.completed && task.dueDate && task.dueDate < todayStr
        );
        break;
      default:
        filteredTasks = tasks;
    }

    // Apply sorting - convert to TaskWithProject format
    const tasksWithProject: TaskWithProject[] = filteredTasks.map((task) => ({
      ...task,
      projectId: project.id,
      projectName: project.name,
    }));
    
    const sortConfig: TaskSortConfig = {
      primarySort: sortBy,
      direction: 'asc',
    };
    
    return sortTasks(tasksWithProject, sortConfig);
  };

  // Only show projects that have tasks matching the filter
  const projectsWithTasks = projects
    .map(project => ({
      ...project,
      filteredTasks: getFilteredTasksForProject(project)
    }))
    .filter(project => project.filteredTasks.length > 0);

  if (projectsWithTasks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckSquare className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No tasks found
        </h3>
        <p className="text-sm text-muted-foreground">
          {filter === 'all' 
            ? 'Create your first task to get started!'
            : `No ${filter} tasks at the moment`
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ActiveScopeFilterChips className="-mt-3 -mx-3 mb-3 rounded-none" />
      {projectsWithTasks.map(project => {
        const isCollapsed = collapsedProjects.has(project.id);
        const taskCount = project.filteredTasks.length;
        const completedCount = project.filteredTasks.filter((t) => t.completed).length;

        return (
          <div 
            key={project.id} 
            className="bg-card rounded-lg border border-border overflow-hidden shadow-sm"
          >
            {/* Project Header.

                This was ONE <button> wrapping the project's name, which is why
                the name could not be an `EntityRef`: that renders an <a> plus
                control <button>s, and nesting either inside a <button> is
                invalid HTML. Splitting the header is the whole fix — the
                container is a <div> that still toggles on click anywhere, and
                the chevron stays a real <button> so the toggle keeps its
                keyboard affordance. */}
            <div
              onClick={() => toggleProjectCollapse(project.id)}
              className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-accent transition-colors cursor-pointer"
            >
              <button
                type="button"
                onClick={(e) => {
                  // The container already toggles; without this the click
                  // would toggle twice and land back where it started.
                  e.stopPropagation();
                  toggleProjectCollapse(project.id);
                }}
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${project.name}`}
                className="flex flex-shrink-0 items-center gap-3"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
              </button>

              <div className="flex-1 min-w-0 text-left">
                {/* THE DOOR LAW: this view groups every task by project, named
                    the project on each group, and gave you no way to reach it —
                    the only click available collapsed a list. Plain click opens
                    `/projects/{id}`; hover gives the project peek. */}
                <EntityRef
                  token="project"
                  id={project.id}
                  name={project.name}
                  showIcon={false}
                  className="text-sm font-semibold text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  {completedCount} of {taskCount} completed
                </p>
              </div>

              {/* A COUNT IS A DOOR: it must REACH the tasks it counts, so it
                  expands and never collapses. A count that hides the very
                  thing it counts is the door closing in the user's face. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsedProjects((current) => {
                    if (!current.has(project.id)) return current;
                    const next = new Set(current);
                    next.delete(project.id);
                    return next;
                  });
                }}
                title={`Show the ${taskCount} ${taskCount === 1 ? "task" : "tasks"} in ${project.name}`}
                aria-label={`Show the ${taskCount} ${taskCount === 1 ? "task" : "tasks"} in ${project.name}`}
                className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium transition-colors hover:bg-primary/20"
              >
                {taskCount}
              </button>
            </div>

            {/* Tasks List */}
            {!isCollapsed && (
              <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
                {project.filteredTasks.map((task) => (
                  <CompactTaskItem
                    key={task.id}
                    task={{
                      ...task,
                      projectId: project.id,
                      projectName: project.name
                    }}
                    isSelected={selectedTaskId === task.id}
                    onSelect={() => onTaskSelect(task.id)}
                    onToggleComplete={() => onTaskToggle(project.id, task.id)}
                    hideProjectName={true}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
