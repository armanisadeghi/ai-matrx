"use client";

import React from "react";
import {
  MoreVertical,
  Layers,
  ArrowUpDown,
  Eye,
  EyeOff,
  ChevronRight,
} from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  selectShowCompleted,
  selectSortBy,
  selectSortOrder,
  selectActiveProject,
  selectFilterScopeIds,
  selectSmartView,
  setFilter,
  setSmartView,
  setShowCompleted,
  setSortBy,
  setSortOrder,
  setShowAllProjects,
  setActiveProject,
} from "@/features/tasks/redux/taskUiSlice";
import type { TaskSortField, TaskSortDirection } from "@/features/tasks/types/sort";
import { selectSmartViewCounts } from "@/features/tasks/redux/selectors";
import { SMART_VIEWS } from "@/features/tasks/constants/smartViews";
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

export default function MobileFilterMenu() {
  const dispatch = useAppDispatch();
  const smartView = useAppSelector(selectSmartView);
  const smartViewCounts = useAppSelector(selectSmartViewCounts);
  const showCompleted = useAppSelector(selectShowCompleted);
  const sortBy = useAppSelector(selectSortBy);
  const sortOrder = useAppSelector(selectSortOrder);
  const activeProject = useAppSelector(selectActiveProject);

  const [showProjectSheet, setShowProjectSheet] = React.useState(false);
  const [showScopeSheet, setShowScopeSheet] = React.useState(false);
  const activeScopeCount = useAppSelector(selectFilterScopeIds).length;

  const getSortLabel = (field: TaskSortField, direction: TaskSortDirection) => {
    const match = SORT_MENU_OPTIONS.find(
      (opt) => opt.field === field && opt.direction === direction,
    );
    return match?.label ?? field;
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Task views and filters"
            className="h-11 w-11 rounded-full"
          >
            <MoreVertical size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Views</DropdownMenuLabel>
          {SMART_VIEWS.map((view) => {
            const Icon = view.icon;
            return (
              <DropdownMenuItem
                key={view.key}
                onClick={() => {
                  dispatch(setSmartView(view.key));
                  if (view.key === "all") {
                    dispatch(setShowAllProjects(true));
                    dispatch(setActiveProject(null));
                    dispatch(setFilter("all"));
                  }
                }}
                className={`min-h-11 ${smartView === view.key ? "bg-primary/10" : ""}`}
              >
                <Icon size={18} className="mr-2" />
                <span className="flex-1">{view.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {smartViewCounts[view.key]}
                </span>
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          <DropdownMenuLabel>Scope</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => setShowProjectSheet(true)}
            className="min-h-11"
          >
            <Layers size={18} className="mr-2" />
            Select Project
            <ChevronRight size={16} className="ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowScopeSheet(true)}
            className="min-h-11"
          >
            <FilterIcon size={18} className="mr-2" />
            Filter by Scope
            {activeScopeCount > 0 && (
              <span className="ml-auto text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                {activeScopeCount}
              </span>
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Sort Section */}
          <DropdownMenuLabel>Sort By</DropdownMenuLabel>
          <DropdownMenuSub>
          <DropdownMenuSubTrigger className="min-h-11">
              <ArrowUpDown size={18} className="mr-2" />
              {getSortLabel(sortBy, sortOrder)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {SORT_MENU_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={`${opt.field}-${opt.direction}`}
                  className={`min-h-11 ${
                    sortBy === opt.field && sortOrder === opt.direction
                      ? "bg-primary/10"
                      : ""
                  }`}
                  onClick={() => {
                    dispatch(setSortBy(opt.field));
                    dispatch(setSortOrder(opt.direction));
                  }}
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
            className="min-h-11"
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
