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
  selectSortOrder,
  selectShowAllProjects,
  selectActiveProject,
  selectFilterScopeIds,
  setFilter,
  setShowCompleted,
  setSortBy,
  setSortOrder,
  setShowAllProjects,
  setActiveProject,
} from "@/features/tasks/redux/taskUiSlice";
import { TaskFilterType } from "@/features/tasks/types";
import type { TaskSortField, TaskSortDirection } from "@/features/tasks/types/sort";
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

interface SortMenuOption {
  field: TaskSortField;
  direction: TaskSortDirection;
  label: string;
}

const SORT_MENU_OPTIONS: SortMenuOption[] = [
  { field: "dueDate", direction: "asc", label: "Due Date (Earliest)" },
  { field: "dueDate", direction: "desc", label: "Due Date (Latest)" },
  { field: "priority", direction: "desc", label: "Priority (High to Low)" },
  { field: "priority", direction: "asc", label: "Priority (Low to High)" },
  { field: "created", direction: "desc", label: "Created (Newest)" },
  { field: "created", direction: "asc", label: "Created (Oldest)" },
  { field: "title", direction: "asc", label: "Title (A-Z)" },
  { field: "title", direction: "desc", label: "Title (Z-A)" },
];

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
  const sortOrder = useAppSelector(selectSortOrder);
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

  const getSortLabel = (field: TaskSortField, direction: TaskSortDirection) => {
    const match = SORT_MENU_OPTIONS.find(
      (opt) => opt.field === field && opt.direction === direction,
    );
    return match?.label ?? field;
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
              {getSortLabel(sortBy, sortOrder)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {SORT_MENU_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={`${opt.field}-${opt.direction}`}
                  onClick={() => {
                    dispatch(setSortBy(opt.field));
                    dispatch(setSortOrder(opt.direction));
                  }}
                  className={
                    sortBy === opt.field && sortOrder === opt.direction
                      ? "bg-primary/10"
                      : ""
                  }
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
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
        <TaskScopeFilter />
      </MatrxDynamicPanelHost>
    </>
  );
}
