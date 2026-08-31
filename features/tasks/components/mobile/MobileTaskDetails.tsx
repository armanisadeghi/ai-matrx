"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Calendar,
  Flag,
  Trash2,
  X,
  Loader2,
  MoreVertical,
  CircleDot,
  CalendarArrowUp,
  Repeat as RepeatIcon,
} from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  updateTaskFieldThunk,
  toggleTaskCompleteThunk,
  deleteTaskThunk,
  createSubtaskThunk,
} from "@/features/tasks/redux/thunks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import {
  buildTasksContextData,
  TASKS_CONTEXT_MENU_PROPS,
} from "@/features/tasks/agent-context/buildTasksContextData";
import {
  TASK_LABEL_OPTIONS,
  TASK_LABELS,
  type TaskLabel,
} from "@/features/tasks/constants/labels";
import { TASK_STATUSES } from "@/features/tasks/constants/status";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import * as taskService from "@/features/tasks/services/taskService";
import { TaskContextPicker } from "../TaskContextSection";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import type { TaskWithProject } from "@/features/tasks/types";
import { TaskStatusPicker } from "../TaskStatusPicker";
import { TaskRecurrencePicker } from "../TaskRecurrencePicker";
import { TaskProvenanceChip } from "../TaskProvenanceChip";
import { TaskSnoozeButton } from "../TaskSnoozeButton";
import { TaskEditorCopyButtonsForDraft } from "../editor/TaskEditorCopyButtons";
import type { UpdateTaskInput } from "@/features/tasks/services/taskService";
import { isValidDateOnly } from "@/utils/dateOnly";
import { toast } from "@/lib/toast";

interface MobileTaskDetailsProps {
  task: TaskWithProject;
  onBack: () => void;
}

function isTaskLabel(value: unknown): value is TaskLabel {
  return (
    typeof value === "string" &&
    TASK_LABELS.some((candidate) => candidate === value)
  );
}

function isTaskStatus(value: unknown): value is TaskWithProject["status"] {
  return (
    typeof value === "string" &&
    TASK_STATUSES.some((candidate) => candidate === value)
  );
}

export default function MobileTaskDetails({
  task,
  onBack,
}: MobileTaskDetailsProps) {
  const dispatch = useAppDispatch();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const refresh = () => dispatch(invalidateAndRefetchFullContext());
  const updateSubtaskStatus = async (subtaskId: string) => {
    await dispatch(toggleTaskCompleteThunk({ taskId: subtaskId })).unwrap();
    await dispatch(invalidateAndRefetchFullContext());
  };
  const deleteSubtask = async (subtaskId: string) => {
    await dispatch(
      deleteTaskThunk({ taskId: subtaskId, projectId: task.projectId }),
    ).unwrap();
    await dispatch(invalidateAndRefetchFullContext());
  };

  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description || "");
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [startDate, setStartDate] = useState(task.startDate || "");
  const [status, setStatus] = useState(task.status);
  const [recurrenceRule, setRecurrenceRule] = useState(
    task.recurrenceRule ?? null,
  );
  const [priority, setPriority] = useState<"low" | "medium" | "high" | null>(
    task.priority || null,
  );
  const [labels, setLabels] = useState<TaskLabel[]>(
    Array.isArray(task.settings?.labels)
      ? task.settings.labels.filter(isTaskLabel)
      : [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const { inputRef: subtaskInputRef, scheduleRefocus: scheduleSubtaskRefocus } =
    useRefocusInputAfterAsync(isAddingSubtask);
  const [isDeleting, setIsDeleting] = useState(false);

  const surfaceDraftRef = useRef({
    title,
    description,
    dueDate,
    startDate,
    status,
    recurrenceRule,
    priority,
    labels,
  });
  useEffect(() => {
    surfaceDraftRef.current = {
      title,
      description,
      dueDate,
      startDate,
      status,
      recurrenceRule,
      priority,
      labels,
    };
  }, [
    title,
    description,
    dueDate,
    startDate,
    status,
    recurrenceRule,
    priority,
    labels,
  ]);

  const persistSurfaceDraft = async () => {
    const pending = surfaceDraftRef.current;
    const patch: UpdateTaskInput = {};
    if (pending.title !== task.title) patch.title = pending.title;
    if (pending.description !== task.description) {
      patch.description = pending.description;
    }
    if (pending.dueDate !== task.dueDate) {
      patch.due_date = pending.dueDate || null;
    }
    if (pending.startDate !== (task.startDate || "")) {
      patch.start_date = pending.startDate || null;
    }
    if (pending.status !== task.status) patch.status = pending.status;
    if (pending.recurrenceRule !== (task.recurrenceRule ?? null)) {
      patch.recurrence_rule = pending.recurrenceRule;
    }
    if (pending.priority !== task.priority) patch.priority = pending.priority;

    if (Object.keys(patch).length > 0) {
      await dispatch(updateTaskFieldThunk({ taskId: task.id, patch })).unwrap();
    }

    const savedLabels = Array.isArray(task.settings?.labels)
      ? task.settings.labels.filter(isTaskLabel)
      : [];
    if (pending.labels.join("\u0000") !== savedLabels.join("\u0000")) {
      const labelsSaved = await taskService.updateTaskLabels(
        task.id,
        pending.labels,
      );
      if (!labelsSaved) {
        throw new Error(`Task ${task.id} labels could not be saved.`);
      }
    }

    await refresh();
    setIsDirty(false);
  };

  const handleSave = async () => {
    if (!isDirty || isSaving) return;

    setIsSaving(true);
    try {
      await persistSurfaceDraft();
    } catch (error) {
      console.error("Error saving task:", error);
      toast.error("Could not save task");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await dispatch(
        deleteTaskThunk({ taskId: task.id, projectId: task.projectId }),
      ).unwrap();
      onBack();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Could not delete task");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim() || isAddingSubtask) return;

    setIsAddingSubtask(true);
    try {
      const createdId = await dispatch(
        createSubtaskThunk({ parentTaskId: task.id, title: newSubtask }),
      ).unwrap();
      if (!createdId) throw new Error("The subtask could not be created.");
      setNewSubtask("");
      scheduleSubtaskRefocus();
      await refresh();
    } catch (error) {
      console.error("Error adding subtask:", error);
      toast.error("Could not add subtask");
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string) => {
    const subtask = task.subtasks?.find((st) => st.id === subtaskId);
    if (!subtask) return;

    try {
      await updateSubtaskStatus(subtaskId);
    } catch (error) {
      console.error("Error toggling subtask:", error);
      toast.error("Could not update subtask completion");
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      await deleteSubtask(subtaskId);
    } catch (error) {
      console.error("Error deleting subtask:", error);
      toast.error("Could not delete subtask");
    }
  };

  const handleToggleComplete = async () => {
    try {
      await dispatch(toggleTaskCompleteThunk({ taskId: task.id })).unwrap();
    } catch (error) {
      console.error("Error changing task completion:", error);
      toast.error("Could not update task completion");
    }
  };

  const getPriorityColor = (p: string | null) => {
    switch (p) {
      case "high":
        return "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400";
      case "medium":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
      case "low":
        return "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter((st) => st.completed).length;
  const totalSubtasks = subtasks.length;
  const getApplicationScope = () => {
    const selectionStart = descriptionRef.current?.selectionStart ?? 0;
    const selectionEnd = descriptionRef.current?.selectionEnd ?? selectionStart;
    const contextData = buildTasksContextData({
      taskId: task.id,
      title,
      description,
      selectionStart,
      selectionEnd,
      status,
      priority,
      dueDate: dueDate || null,
      projectId: task.projectId || null,
      projectName: task.projectName || null,
      subtasks: subtasks.map((subtask) => ({
        id: subtask.id,
        title: subtask.title,
        status: subtask.status,
      })),
      labels,
      assigneeId: task.assigneeId ?? null,
      createdBy: task.userId ?? null,
    });
    return buildApplicationScopeFromMenuContext({
      selectedText:
        selectionEnd > selectionStart
          ? description.slice(selectionStart, selectionEnd)
          : "",
      selectionRange: null,
      contextData,
    });
  };

  const getSurfaceWriteHandlers = () => ({
    task_title: (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("task_title expects a non-empty string.");
      }
      const next = value.trim();
      surfaceDraftRef.current.title = next;
      setTitle(next);
      setIsDirty(true);
    },
    task_description: (value: unknown) => {
      if (typeof value !== "string") {
        throw new Error("task_description expects a string.");
      }
      surfaceDraftRef.current.description = value;
      setDescription(value);
      setIsDirty(true);
    },
    task_status: (value: unknown) => {
      if (!isTaskStatus(value)) {
        throw new Error(
          `task_status expects one of: ${TASK_STATUSES.join(" | ")}.`,
        );
      }
      surfaceDraftRef.current.status = value;
      setStatus(value);
      setIsDirty(true);
    },
    task_priority: (value: unknown) => {
      if (
        value !== null &&
        value !== "low" &&
        value !== "medium" &&
        value !== "high"
      ) {
        throw new Error(
          "task_priority expects low | medium | high, or null to clear.",
        );
      }
      surfaceDraftRef.current.priority = value;
      setPriority(value);
      setIsDirty(true);
    },
    task_due_date: (value: unknown) => {
      if (
        value !== null &&
        (typeof value !== "string" || !isValidDateOnly(value))
      ) {
        throw new Error(
          "task_due_date expects a YYYY-MM-DD string, or null to clear.",
        );
      }
      surfaceDraftRef.current.dueDate = value ?? "";
      setDueDate(value ?? "");
      setIsDirty(true);
    },
    task_labels: (value: unknown) => {
      if (!Array.isArray(value) || !value.every(isTaskLabel)) {
        throw new Error(
          `task_labels expects an array drawn from: ${TASK_LABELS.join(" | ")}.`,
        );
      }
      surfaceDraftRef.current.labels = value;
      setLabels(value);
      setIsDirty(true);
    },
    add_subtasks: async (value: unknown) => {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every((item) => typeof item === "string" && item.trim())
      ) {
        throw new Error(
          "add_subtasks expects a non-empty array of subtask title strings.",
        );
      }
      for (const subtaskTitle of value) {
        const createdId = await dispatch(
          createSubtaskThunk({
            parentTaskId: task.id,
            title: subtaskTitle.trim(),
          }),
        ).unwrap();
        if (!createdId) {
          throw new Error(`Could not create subtask "${subtaskTitle.trim()}".`);
        }
      }
      await refresh();
    },
    save_task: async () => {
      // The ref is updated synchronously by each draft handler, so an adjacent
      // save call cannot observe the previous render's local-state closure.
      await persistSurfaceDraft();
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={TASKS_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getApplicationScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <NonEditableContextMenu
        sourceFeature={TASKS_CONTEXT_MENU_PROPS.sourceFeature}
        surfaceName={TASKS_CONTEXT_MENU_PROPS.surfaceName}
        getApplicationScope={getApplicationScope}
        contentSource={{ type: "raw" }}
        entity={{
          type: "task",
          id: task.id,
          title,
          resourceType: "task",
        }}
      >
        <div className="h-full flex flex-col bg-background overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-border bg-card">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onBack}
                  aria-label="Back to tasks"
                  className="flex-shrink-0 h-11 w-11 rounded-full"
                >
                  <ChevronLeft size={18} />
                </Button>
                <Checkbox
                  checked={task.completed}
                  onCheckedChange={() => void handleToggleComplete()}
                  className="flex-shrink-0"
                />
                <h1
                  className={`text-lg font-semibold flex-1 truncate ${
                    task.completed
                      ? "line-through text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {task.title}
                </h1>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <TaskEditorCopyButtonsForDraft
                  size="sm"
                  location="Tasks — mobile task editor"
                  getInput={() => ({
                    taskId: task.id,
                    effective: {
                      title,
                      description,
                      dueDate: dueDate || null,
                      priority,
                      projectId: task.projectId || null,
                      assigneeId: task.assigneeId ?? null,
                      labels,
                      status,
                      startDate: startDate || null,
                      recurrenceRule,
                    },
                    saved: {
                      id: task.id,
                      title: task.title,
                      description: task.description,
                      due_date: task.dueDate || null,
                      start_date: task.startDate ?? null,
                      priority: task.priority ?? null,
                      status: task.status,
                      project_id: task.projectId || null,
                      assignee_id: task.assigneeId ?? null,
                      recurrence_rule: task.recurrenceRule ?? null,
                      settings: task.settings,
                    },
                    isDirty,
                    projectName: task.projectName,
                    subtasks: subtasks.map((subtask) => ({
                      id: subtask.id,
                      title: subtask.title,
                      status: subtask.status,
                    })),
                  })}
                />
                <ReferenceCopyButton
                  referenceType="task"
                  id={task.id}
                  label={task.title}
                  toastLabel={task.title || "Task"}
                  size="sm"
                  className="h-11 w-11"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Task actions"
                      className="flex-shrink-0 h-11 w-11 rounded-full"
                    >
                      <MoreVertical size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isDirty && (
                      <>
                        <DropdownMenuItem
                          onClick={handleSave}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <>
                              <Loader2
                                size={16}
                                className="mr-2 animate-spin"
                              />
                              Saving...
                            </>
                          ) : (
                            "Save Changes"
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="text-destructive focus:text-destructive"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 size={16} className="mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 size={16} className="mr-2" />
                          Delete Task
                        </>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-4 space-y-5 pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <TaskProvenanceChip
                  origin={task.origin ?? null}
                  sourceType={task.sourceType ?? null}
                  sourceUrl={task.sourceUrl ?? null}
                  sourceLabel={task.sourceLabel ?? null}
                  className="min-h-11 px-3 text-sm"
                />
                <TaskSnoozeButton
                  taskId={task.id}
                  className="min-h-11 px-3 text-sm"
                />
              </div>

              {/* Title */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Title
                </label>
                <ProInput
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setIsDirty(true);
                  }}
                  onFocus={(e) => {
                    setTimeout(() => {
                      e.target.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }, 300);
                  }}
                  className="text-base min-h-11"
                  showCopyButton={false}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Description
                </label>
                <ProTextarea
                  ref={descriptionRef}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Add details..."
                  autoGrow
                  minHeight={100}
                  maxHeight={240}
                  showCopyButton={false}
                  className="text-base resize-y min-h-[100px]"
                  wrapperClassName="w-full"
                  surfaceName={TASKS_CONTEXT_MENU_PROPS.surfaceName}
                  getApplicationScope={getApplicationScope}
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Calendar size={16} />
                  Due Date
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setIsDirty(true);
                  }}
                  className="text-base min-h-11"
                  style={{ fontSize: "16px" }}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <CircleDot size={16} />
                  Status
                </label>
                <TaskStatusPicker
                  value={status}
                  onChange={(value) => {
                    setStatus(value);
                    setIsDirty(true);
                  }}
                  className="min-h-11 px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <CalendarArrowUp size={16} />
                  Start date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setIsDirty(true);
                  }}
                  className="text-base min-h-11"
                  style={{ fontSize: "16px" }}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <RepeatIcon size={16} />
                  Repeat
                </label>
                <TaskRecurrencePicker
                  value={recurrenceRule}
                  onChange={(value) => {
                    setRecurrenceRule(value);
                    setIsDirty(true);
                  }}
                  className="min-h-11 px-3 text-sm"
                />
              </div>

              {/* Context — org, scopes, project (compact) */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Context
                </label>
                <TaskContextPicker taskId={task.id} taskTitle={task.title} />
              </div>

              {/* Priority */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Flag size={16} />
                  Priority
                </label>
                <Select
                  value={priority || "none"}
                  onValueChange={(val) => {
                    if (val === "none") {
                      setPriority(null);
                    } else if (
                      val === "low" ||
                      val === "medium" ||
                      val === "high"
                    ) {
                      setPriority(val);
                    }
                    setIsDirty(true);
                  }}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue>
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-medium ${getPriorityColor(priority)}`}
                      >
                        {priority
                          ? priority.charAt(0).toUpperCase() + priority.slice(1)
                          : "None"}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="high">
                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                        High
                      </span>
                    </SelectItem>
                    <SelectItem value="medium">
                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                        Medium
                      </span>
                    </SelectItem>
                    <SelectItem value="low">
                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                        Low
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {TASK_LABEL_OPTIONS.map((option) => {
                    const active = labels.includes(option.value);
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={active}
                        onClick={() => {
                          setLabels((current) =>
                            current.includes(option.value)
                              ? current.filter(
                                  (label) => label !== option.value,
                                )
                              : [...current, option.value],
                          );
                          setIsDirty(true);
                        }}
                        className={active ? option.color : undefined}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Subtasks */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Subtasks{" "}
                  {totalSubtasks > 0 &&
                    `(${completedSubtasks}/${totalSubtasks})`}
                </label>
                <div className="space-y-2">
                  {subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-2 group py-1"
                    >
                      <Checkbox
                        checked={subtask.completed}
                        onCheckedChange={() => handleToggleSubtask(subtask.id)}
                      />
                      <span
                        className={`text-sm flex-1 ${
                          subtask.completed
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {subtask.title}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteSubtask(subtask.id)}
                        className="h-11 w-11 rounded-full opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                        aria-label={`Delete subtask ${subtask.title}`}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                  <ProInput
                    ref={subtaskInputRef}
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onSubmit={() => void handleAddSubtask()}
                    submitOnEnter
                    submitLabel="Add subtask"
                    submitDisabled={!newSubtask.trim() || isAddingSubtask}
                    isSubmitting={isAddingSubtask}
                    showCopyButton={false}
                    placeholder="Add a subtask..."
                    disabled={isAddingSubtask}
                    className="text-base flex-1"
                    wrapperClassName="flex-1 min-w-0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sticky bottom action bar — Save (when dirty) + Delete. Always
          visible so the user never has to scroll back up. `pb-safe` covers
          the iOS home-indicator inset on real devices. */}
          <div className="flex-shrink-0 border-t border-border bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex items-center gap-2">
            <Button
              variant="ghost"
              size="lg"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {isDeleting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Trash2 size={18} />
              )}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="flex-1"
              size="lg"
            >
              {isSaving ? (
                <>
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Saving...
                </>
              ) : isDirty ? (
                "Save Changes"
              ) : (
                "Saved"
              )}
            </Button>
          </div>
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
