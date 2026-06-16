"use client";

import React from "react";
import {
  MoreVertical,
  Inbox,
  CheckCircle,
  AlertCircle,
  Layers,
  ArrowUpDown,
  Eye,
  EyeOff,
  ChevronRight,
} from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  selectTaskFilter,
  selectShowCompleted,
  selectSortBy,
  selectShowAllProjects,
  selectActiveProject,
  selectFilterScopeIds,
  setFilter,
  setShowCompleted,
  setSortBy,
  setShowAllProjects,
  setActiveProject,
} from "@/features/tasks/redux/taskUiSlice";
import { TaskFilterType } from "@/features/tasks/types";
import { TaskSortField } from "@/features/tasks/types/sort";

type TaskSortOption =
  | `${TaskSortField}-${"asc" | "desc"}`
  | "title-asc"
  | "title-desc"
  | "due-date-asc"
  | "due-date-desc"
  | "priority-asc"
  | "priority-desc"
  | "created-asc"
  | "created-desc";
import { Button } from "@/components/ui/ButtonMine";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import MobileProjectSelector from "./MobileProjectSelector";
import TaskScopeFilter from "../TaskScopeFilter";
import { useAppSelector } from "@/lib/redux/hooks";
import { Filter as FilterIcon } from "lucide-react";

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

export default function MobileFilterMenu() {
  const dispatch = useAppDispatch();
  const filter = useAppSelector(selectTaskFilter);
  const showCompleted = useAppSelector(selectShowCompleted);
  const sortBy = useAppSelector(selectSortBy);
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const activeProject = useAppSelector(selectActiveProject);

  const [showProjectSheet, setShowProjectSheet] = React.useState(false);
  const [showScopeSheet, setShowScopeSheet] = React.useState(false);
  const activeScopeCount = useAppSelector(selectFilterScopeIds).length;

  const getFilterIcon = (filterType: TaskFilterType) => {
    switch (filterType) {
      case "all":
        return <Inbox size={18} />;
      case "incomplete":
        return <Circle size={18} />;
      case "overdue":
        return <AlertCircle size={18} />;
    }
  };

  const getSortLabel = (sort: TaskSortOption) => {
    const labels: Partial<Record<TaskSortOption, string>> = {
      "due-date-asc": "Due Date (Earliest)",
      "due-date-desc": "Due Date (Latest)",
      "priority-desc": "Priority (High to Low)",
      "priority-asc": "Priority (Low to High)",
      "created-desc": "Created (Newest)",
      "created-asc": "Created (Oldest)",
      "title-asc": "Title (A-Z)",
      "title-desc": "Title (Z-A)",
    };
    return labels[sort] || sort;
  };

  const handleFilterSelect = (filterType: TaskFilterType) => {
    dispatch(setFilter(filterType));
    if (filterType !== "all" && !showAllProjects && !activeProject) {
      dispatch(setShowAllProjects(true));
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
            <MoreVertical size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* View/Filter Section */}
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              dispatch(setShowAllProjects(true));
              dispatch(setFilter("all"));
            }}
            className={
              showAllProjects && filter === "all" ? "bg-primary/10" : ""
            }
          >
            <Layers size={18} className="mr-2" />
            All Tasks
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowProjectSheet(true)}>
            <Layers size={18} className="mr-2" />
            Select Project
            <ChevronRight size={16} className="ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowScopeSheet(true)}>
            <FilterIcon size={18} className="mr-2" />
            Filter by Scope
            {activeScopeCount > 0 && (
              <span className="ml-auto text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                {activeScopeCount}
              </span>
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Filter Section */}
          <DropdownMenuLabel>Filter</DropdownMenuLabel>
          {(["all", "incomplete", "overdue"] as TaskFilterType[]).map(
            (filterType) => (
              <DropdownMenuItem
                key={filterType}
                onClick={() => handleFilterSelect(filterType)}
                className={filter === filterType ? "bg-primary/10" : ""}
              >
                {getFilterIcon(filterType)}
                <span className="ml-2 capitalize">{filterType}</span>
              </DropdownMenuItem>
            ),
          )}

          <DropdownMenuSeparator />

          {/* Sort Section */}
          <DropdownMenuLabel>Sort By</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowUpDown size={18} className="mr-2" />
              {getSortLabel(sortBy as TaskSortOption)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {(
                [
                  "due-date-asc",
                  "due-date-desc",
                  "priority-desc",
                  "priority-asc",
                  "created-desc",
                  "created-asc",
                  "title-asc",
                  "title-desc",
                ] as TaskSortOption[]
              ).map((sort) => {
                // Extract field from TaskSortOption (e.g., 'priority-asc' -> 'priority')
                const field =
                  sort.split("-")[0] === "due"
                    ? "dueDate"
                    : sort.split("-")[0] === "priority"
                      ? "priority"
                      : sort.split("-")[0] === "created"
                        ? "created"
                        : sort.split("-")[0] === "title"
                          ? "title"
                          : "lastUpdated";

                return (
                  <DropdownMenuItem
                    key={sort}
                    onClick={() => {
                      // @ts-ignore - COMPLEX: setSortBy expects TaskSortField but receives TaskSortOption, may need refactor
                      dispatch(setSortBy(field as TaskSortField));
                    }}
                    // @ts-ignore - COMPLEX: Comparison between TaskSortField and TaskSortOption types
                    className={sortBy === field ? "bg-primary/10" : ""}
                  >
                    {getSortLabel(sort)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* Display Options */}
          <DropdownMenuLabel>Display</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => dispatch(setShowCompleted(!showCompleted))}
          >
            {showCompleted ? (
              <Eye size={18} className="mr-2" />
            ) : (
              <EyeOff size={18} className="mr-2" />
            )}
            {showCompleted ? "Hide" : "Show"} Completed
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Project Selector Sheet */}
      <MatrxDynamicPanelHost
        open={showProjectSheet}
        onOpenChange={setShowProjectSheet}
        title="Select Project"
        description="Choose a project to view its tasks"
        position="bottom"
        defaultSize={60}
        contentClassName="overflow-y-auto"
      >
        <MobileProjectSelector
          selectedProjectId={activeProject}
          onSelectProject={(projectId) => {
            if (projectId) {
              dispatch(setActiveProject(projectId));
              dispatch(setShowAllProjects(false));
            }
            setShowProjectSheet(false);
          }}
        />
      </MatrxDynamicPanelHost>

      <MatrxDynamicPanelHost
        open={showScopeSheet}
        onOpenChange={setShowScopeSheet}
        title="Filter by Scope"
        description="Narrow tasks by the scope values assigned to them."
        position="bottom"
        defaultSize={70}
        contentClassName="overflow-y-auto"
      >
        <TaskScopeFilter variant="sidebar" />
      </MatrxDynamicPanelHost>
    </>
  );
}
