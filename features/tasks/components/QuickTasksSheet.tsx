// features/tasks/components/QuickTasksSheet.tsx
"use client";

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  selectProjects,
  selectFilteredTasks,
} from "@/features/tasks/redux/selectors";
import {
  selectActiveProject,
  selectShowAllProjects,
  selectShowCompleted,
  selectTaskFilter,
  selectNewTaskTitle,
  selectIsCreatingTask,
  selectTasksLoading,
  selectSortBy,
  selectSearchQuery,
  setActiveProject,
  setShowAllProjects,
  setShowCompleted,
  setFilter,
  setNewTaskTitle,
  setSortBy,
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
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import {
  ExternalLink,
  Folder,
  Layers,
  Inbox,
  CheckCircle,
  AlertCircle,
  FolderPlus,
  Eye,
  EyeOff,
  Calendar,
  Flag,
  ChevronDown,
  ChevronUp,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import CompactTaskItem from "./CompactTaskItem";
import TaskDetailsPanel from "./TaskDetailsPanel";
import TaskSortControl from "./TaskSortControl";
import { QuickTasksToolbarGroup } from "./QuickTasksToolbarGroup";
import { XTapButton } from "@/components/icons/tap-buttons";
import type { TaskFilterType } from "../types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOverlayData } from "@/lib/redux/slices/overlaySlice";

interface QuickTasksSheetProps {
  onClose?: () => void;
  className?: string;
}

interface QuickTasksOverlayData {
  prePopulate?: {
    title?: string;
    description?: string;
    metadataInfo?: string;
  };
  className?: string;
}

/** Hollow circle glyph for the "Incomplete" filter (module-scope, stable). */
const Circle = ({ size, className }: { size: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
  </svg>
);

function QuickTasksSheetContent({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectProjects);
  const activeProject = useAppSelector(selectActiveProject);
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const showCompleted = useAppSelector(selectShowCompleted);
  const filter = useAppSelector(selectTaskFilter);
  const newTaskTitle = useAppSelector(selectNewTaskTitle);
  const isCreatingTask = useAppSelector(selectIsCreatingTask);
  const {
    inputRef: newTaskInputRef,
    scheduleRefocus: scheduleQuickAddRefocus,
  } = useRefocusInputAfterAsync(isCreatingTask);
  const loading = useAppSelector(selectTasksLoading);
  const sortBy = useAppSelector(selectSortBy);
  const searchQuery = useAppSelector(selectSearchQuery);
  const filteredTasks = useAppSelector(selectFilteredTasks);
  const orgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showQuickAddDescription, setShowQuickAddDescription] = useState(false);
  const [quickAddDescription, setQuickAddDescription] = useState("");
  const [quickAddDueDate, setQuickAddDueDate] = useState("");
  const [quickAddPriority, setQuickAddPriority] = useState<
    "low" | "medium" | "high" | ""
  >("");
  const [showExpandedForm, setShowExpandedForm] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [hasPrePopulated, setHasPrePopulated] = useState(false);
  // Quick mode: open focused on capture, not on the Views/Filters/Projects
  // sidebar. The sidebar is one panel-toggle away.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Access overlay data for pre-population (data payload only — not the wrapper).
  const overlayData = useAppSelector(
    (state) =>
      selectOverlayData(state, "quickTasks") as QuickTasksOverlayData | null,
  );

  // Pre-populate task fields from overlay data (one-time only). Seeding local
  // form state from the Redux overlay payload the first time it's available is
  // a legitimate external-store sync — guarded by `hasPrePopulated` so it runs
  // once — not a render cascade.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (overlayData?.prePopulate && !hasPrePopulated) {
      const { title, description, metadataInfo } = overlayData.prePopulate;

      if (title) {
        dispatch(setNewTaskTitle(title));
      }

      if (description || metadataInfo) {
        const fullDescription = description + (metadataInfo || "");
        setQuickAddDescription(fullDescription);
        setShowQuickAddDescription(true);
      }

      setHasPrePopulated(true);
    }
  }, [overlayData, hasPrePopulated, dispatch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The project a new task lands in: the active project, else the first
  // available. Purely derived — never user-set — so no state/effect needed.
  const selectedProjectForTask =
    activeProject ?? (projects.length > 0 ? projects[0].id : null);

  // Drop the cursor into the capture box the moment it becomes usable — the
  // user opened "Quick Task" to type, not to hunt for the field. Fires once,
  // when a target project first exists (the input is disabled until then), and
  // only on the list view (not while a task's details are open).
  const hasAutoFocusedRef = useRef(false);
  useEffect(() => {
    if (hasAutoFocusedRef.current) return;
    if (!selectedProjectForTask || selectedTaskId) return;
    hasAutoFocusedRef.current = true;
    const t = window.setTimeout(() => newTaskInputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [selectedProjectForTask, selectedTaskId]);

  // filteredTasks is sourced from Redux above

  // Build selector value - format: "view:all" or "filter:incomplete" or "project:id"
  const selectorValue = useMemo(() => {
    if (showAllProjects) {
      return filter === "all" ? "view:all" : `filter:${filter}`;
    } else if (activeProject) {
      return `project:${activeProject}`;
    }
    return "view:all";
  }, [showAllProjects, filter, activeProject]);

  const handleSelectorChange = useCallback(
    (value: string) => {
      const [type, id] = value.split(":");

      if (type === "view") {
        dispatch(setShowAllProjects(true));
        dispatch(setFilter("all"));
      } else if (type === "filter") {
        dispatch(setShowAllProjects(true));
        dispatch(setFilter(id as TaskFilterType));
      } else if (type === "project") {
        dispatch(setShowAllProjects(false));
        dispatch(setActiveProject(id));
      }
    },
    [dispatch],
  );

  const handleAddTask = useCallback(async () => {
    if (!newTaskTitle.trim() || !selectedProjectForTask) return;

    const defaultScopeIds = Object.values(scopeSelections ?? {}).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );

    const newTaskId = await dispatch(
      createTaskThunk({
        title: newTaskTitle,
        description: quickAddDescription.trim() || null,
        dueDate: quickAddDueDate || null,
        projectId: selectedProjectForTask,
        priority: quickAddPriority || null,
        organizationId: orgId,
        scopeIds: defaultScopeIds,
      }),
    ).unwrap();

    if (newTaskId) {
      setSelectedTaskId(newTaskId);
      scheduleQuickAddRefocus();
    }

    setQuickAddDescription("");
    setQuickAddDueDate("");
    setQuickAddPriority("");
    setShowQuickAddDescription(false);
    setShowExpandedForm(false);
  }, [
    newTaskTitle,
    selectedProjectForTask,
    quickAddDescription,
    quickAddDueDate,
    quickAddPriority,
    dispatch,
    orgId,
    scopeSelections,
  ]);

  const handleTitleChange = useCallback(
    (value: string) => {
      dispatch(setNewTaskTitle(value));
      if (value.trim() && !showExpandedForm) {
        setShowExpandedForm(true);
      }
    },
    [dispatch, showExpandedForm],
  );

  const handleCancelQuickAdd = useCallback(() => {
    dispatch(setNewTaskTitle(""));
    setQuickAddDescription("");
    setQuickAddDueDate("");
    setQuickAddPriority("");
    setShowQuickAddDescription(false);
    setShowExpandedForm(false);
    newTaskInputRef.current?.focus();
  }, [dispatch]);

  const selectedTask = selectedTaskId
    ? filteredTasks.find((t) => t.id === selectedTaskId)
    : null;

  if (loading && projects.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading tasks...
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-row h-full", className)}>
      {/* Collapsible Sidebar */}
      <div
        className={cn(
          "flex-shrink-0 transition-all duration-300 ease-in-out border-r border-zinc-200 dark:border-zinc-800 bg-background flex flex-col",
          sidebarOpen ? "w-48" : "w-0 border-r-0 overflow-hidden",
        )}
      >
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-4">
            <div className="space-y-1">
              <h4 className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Views
              </h4>
              <Button
                variant={selectorValue === "view:all" ? "secondary" : "ghost"}
                className="w-full justify-start text-[11px] h-7 px-2"
                onClick={() => handleSelectorChange("view:all")}
              >
                <Layers className="mr-2 h-3.5 w-3.5" /> All Tasks
              </Button>
            </div>

            <div className="space-y-1">
              <h4 className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Filters
              </h4>
              <Button
                variant={
                  selectorValue === "filter:incomplete" ? "secondary" : "ghost"
                }
                className="w-full justify-start text-[11px] h-7 px-2"
                onClick={() => handleSelectorChange("filter:incomplete")}
              >
                <Circle size={12} className="mr-2" /> Incomplete
              </Button>
              <Button
                variant={
                  selectorValue === "filter:overdue" ? "secondary" : "ghost"
                }
                className="w-full justify-start text-[11px] h-7 px-2"
                onClick={() => handleSelectorChange("filter:overdue")}
              >
                <AlertCircle className="mr-2 h-3.5 w-3.5" /> Overdue
              </Button>
            </div>

            {projects.length > 0 && (
              <div className="space-y-1">
                <h4 className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Projects
                </h4>
                {projects.map((p) => (
                  <Button
                    key={p.id}
                    variant={
                      selectorValue === `project:${p.id}`
                        ? "secondary"
                        : "ghost"
                    }
                    className="w-full justify-start text-[11px] h-7 px-2"
                    onClick={() => handleSelectorChange(`project:${p.id}`)}
                  >
                    <Folder className="mr-2 h-3.5 w-3.5" />
                    <span className="truncate flex-1 text-left">{p.name}</span>
                    <span className="ml-2 text-[9px] text-muted-foreground">
                      {p.tasks.length}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Header */}
        <div className="flex items-center gap-2 p-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-sm shrink-0"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" />
            ) : (
              <PanelLeft className="h-3.5 w-3.5" />
            )}
          </Button>

          <span className="text-xs font-semibold ml-1 truncate flex-1">
            {showAllProjects
              ? filter === "all"
                ? "All"
                : filter === "incomplete"
                  ? "Incomplete"
                  : "Overdue"
              : projects.find((p) => p.id === activeProject)?.name ||
                "Select View"}
          </span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full"
                  onClick={() => setShowNewProjectForm(!showNewProjectForm)}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Project</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full"
                  onClick={() => dispatch(setShowCompleted(!showCompleted))}
                >
                  {showCompleted ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showCompleted ? "Hide Completed" : "Show Completed"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TaskSortControl
            currentSort={sortBy}
            onSortChange={(s) => dispatch(setSortBy(s))}
            compact={true}
            className="bg-background"
          />

          <div className="ml-auto pl-2 border-l border-zinc-200 dark:border-zinc-800">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full"
                    onClick={() => window.open("/tasks", "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in New Tab</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Main Content Area - Single View: List OR Details */}
        <div className="flex-1 overflow-hidden">
          {!selectedTask ? (
            /* Task List View */
            <div className="flex flex-col h-full bg-background">
              {/* Quick Add Task Form — first, so capture is immediate */}
              <div className="py-1 px-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-0">
                    <div className="flex-1 min-w-0">
                      <ProInput
                        ref={newTaskInputRef}
                        value={newTaskTitle}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        placeholder="Add new task..."
                        disabled={isCreatingTask || !selectedProjectForTask}
                        onSubmit={handleAddTask}
                        submitOnEnter
                        submitLabel="Add task"
                        submitDisabled={
                          !newTaskTitle.trim() ||
                          isCreatingTask ||
                          !selectedProjectForTask
                        }
                        isSubmitting={isCreatingTask}
                        showCopyButton={false}
                      />
                    </div>
                    {showExpandedForm && (
                      <XTapButton
                        variant="transparent"
                        onClick={handleCancelQuickAdd}
                        ariaLabel="Cancel"
                        tooltip="Cancel"
                        className="shrink-0 text-muted-foreground"
                      />
                    )}
                  </div>

                  {showExpandedForm && (
                    <div className="space-y-2 pl-0.5">
                      <ProTextarea
                        value={quickAddDescription}
                        onChange={(e) => setQuickAddDescription(e.target.value)}
                        placeholder="Description (optional)..."
                        className="text-xs min-h-[50px] resize-none"
                        showCopyButton={false}
                      />
                      <div className="flex gap-2">
                        {/* Due date */}
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="date"
                            value={quickAddDueDate}
                            onChange={(e) => setQuickAddDueDate(e.target.value)}
                            className="flex-1 h-7 text-xs bg-transparent border border-border rounded-md px-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        {/* Priority */}
                        <Select
                          value={quickAddPriority || "none"}
                          onValueChange={(v) =>
                            setQuickAddPriority(
                              v === "none"
                                ? ""
                                : (v as "low" | "medium" | "high"),
                            )
                          }
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <div className="flex items-center gap-1.5">
                              <Flag
                                size={11}
                                className="text-muted-foreground"
                              />
                              <SelectValue>
                                {quickAddPriority
                                  ? quickAddPriority.charAt(0).toUpperCase() +
                                    quickAddPriority.slice(1)
                                  : "Priority"}
                              </SelectValue>
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-xs">
                              None
                            </SelectItem>
                            <SelectItem value="high" className="text-xs">
                              <span className="text-red-600 dark:text-red-400 font-medium">
                                High
                              </span>
                            </SelectItem>
                            <SelectItem value="medium" className="text-xs">
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                Medium
                              </span>
                            </SelectItem>
                            <SelectItem value="low" className="text-xs">
                              <span className="text-green-600 dark:text-green-400 font-medium">
                                Low
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Toolbar group — search + actions (header duplicates kept for now) */}
              <div className="px-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <QuickTasksToolbarGroup
                  searchQuery={searchQuery}
                  onSearchChange={(q) => dispatch(setSearchQuery(q))}
                  sidebarOpen={sidebarOpen}
                  onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
                  showCompleted={showCompleted}
                  onShowCompletedToggle={() =>
                    dispatch(setShowCompleted(!showCompleted))
                  }
                  sortBy={sortBy}
                  onSortChange={(s) => dispatch(setSortBy(s))}
                  onNewProject={() =>
                    setShowNewProjectForm(!showNewProjectForm)
                  }
                />
              </div>

              {/* Tasks List */}
              <ScrollArea className="flex-1">
                <div className="p-1">
                  {filteredTasks.length === 0 ? (
                    <div className="text-center text-xs text-zinc-500 dark:text-zinc-400 py-4">
                      {projects.length === 0
                        ? "Create a project to get started"
                        : "No tasks found"}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredTasks.map((task) => (
                        <CompactTaskItem
                          key={task.id}
                          task={task}
                          isSelected={false}
                          onSelect={() => setSelectedTaskId(task.id)}
                          onToggleComplete={() =>
                            dispatch(
                              toggleTaskCompleteThunk({ taskId: task.id }),
                            )
                          }
                          hideProjectName={!showAllProjects}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : (
            /* Full Task Details View */
            <div className="h-full bg-zinc-50 dark:bg-zinc-900">
              <TaskDetailsPanel
                task={selectedTask}
                onClose={() => setSelectedTaskId(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * QuickTasksSheet - Efficient task manager for FloatingSheet
 * Follows the pattern established by features/notes/actions/QuickNotesSheet
 */
export function QuickTasksSheet({ onClose, className }: QuickTasksSheetProps) {
  // Idempotent: fires hierarchy RPC only when status === 'idle'. Shared with
  // every other consumer in the app — no duplicate fetching.
  useNavTree();
  return <QuickTasksSheetContent className={className} />;
}
