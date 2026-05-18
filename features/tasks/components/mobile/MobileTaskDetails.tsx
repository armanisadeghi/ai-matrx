"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  Calendar,
  Flag,
  Folder,
  Trash2,
  Plus,
  X,
  Loader2,
  MoreVertical,
} from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { selectProjects } from "@/features/tasks/redux/selectors";
import {
  updateTaskFieldThunk,
  toggleTaskCompleteThunk,
  deleteTaskThunk,
  moveTaskThunk,
} from "@/features/tasks/redux/thunks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ScopePicker } from "@/features/agent-context/components/ScopePicker";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

interface MobileTaskDetailsProps {
  task: any;
  onBack: () => void;
}

export default function MobileTaskDetails({
  task,
  onBack,
}: MobileTaskDetailsProps) {
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectProjects);
  const orgId = useAppSelector(selectOrganizationId);

  const refresh = () => dispatch(invalidateAndRefetchFullContext());
  const createSubtask = async (parentTaskId: string, title: string) => {
    const created = await taskService.createSubtask(parentTaskId, title);
    if (created) await dispatch(invalidateAndRefetchFullContext());
  };
  const updateSubtaskStatus = async (subtaskId: string, completed: boolean) => {
    const ok = await taskService.updateSubtaskStatus(subtaskId, completed);
    if (ok) await dispatch(invalidateAndRefetchFullContext());
  };
  const deleteSubtask = async (subtaskId: string) => {
    const ok = await taskService.deleteSubtask(subtaskId);
    if (ok) await dispatch(invalidateAndRefetchFullContext());
  };

  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description || "");
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [projectId, setProjectId] = useState<string | null>(
    task.projectId || null,
  );
  const [priority, setPriority] = useState<"low" | "medium" | "high" | null>(
    task.priority || null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Update local state when task changes
  useEffect(() => {
    setTitle(task.title || "");
    setDescription(task.description || "");
    setDueDate(task.dueDate || "");
    setProjectId(task.projectId || null);
    setPriority(task.priority || null);
    setIsDirty(false);
  }, [
    task.id,
    task.title,
    task.description,
    task.dueDate,
    task.projectId,
    task.priority,
  ]);

  const handleSave = async () => {
    if (!isDirty || isSaving) return;

    setIsSaving(true);
    try {
      if (title !== task.title) {
        await dispatch(
          updateTaskFieldThunk({ taskId: task.id, patch: { title } }),
        );
      }
      if (description !== task.description) {
        await dispatch(
          updateTaskFieldThunk({ taskId: task.id, patch: { description } }),
        );
      }
      if (dueDate !== task.dueDate) {
        await dispatch(
          updateTaskFieldThunk({
            taskId: task.id,
            patch: { due_date: dueDate || null },
          }),
        );
      }
      if (projectId !== task.projectId) {
        await dispatch(
          moveTaskThunk({
            taskId: task.id,
            fromProjectId: task.projectId,
            toProjectId: projectId,
          }),
        );
      }
      if (priority !== task.priority) {
        await dispatch(
          updateTaskFieldThunk({ taskId: task.id, patch: { priority } }),
        );
      }
      setIsDirty(false);
    } catch (error) {
      console.error("Error saving task:", error);
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
      );
      onBack();
    } catch (error) {
      console.error("Error deleting task:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim() || isAddingSubtask) return;

    setIsAddingSubtask(true);
    try {
      await createSubtask(task.id, newSubtask);
      setNewSubtask("");
      await refresh();
    } catch (error) {
      console.error("Error adding subtask:", error);
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string) => {
    const subtask = task.subtasks?.find((st: any) => st.id === subtaskId);
    if (!subtask) return;

    try {
      await updateSubtaskStatus(subtaskId, !subtask.completed);
      await refresh();
    } catch (error) {
      console.error("Error toggling subtask:", error);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      await deleteSubtask(subtaskId);
      await refresh();
    } catch (error) {
      console.error("Error deleting subtask:", error);
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
  const completedSubtasks = subtasks.filter((st: any) => st.completed).length;
  const totalSubtasks = subtasks.length;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="flex-shrink-0 h-7 w-7 rounded-full"
            >
              <ChevronLeft size={18} />
            </Button>
            <Checkbox
              checked={task.completed}
              onCheckedChange={() =>
                dispatch(toggleTaskCompleteThunk({ taskId: task.id }))
              }
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 h-7 w-7 rounded-full"
              >
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isDirty && (
                <>
                  <DropdownMenuItem onClick={handleSave} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="p-4 space-y-5 pb-6">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Title
            </label>
            <Input
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
              className="text-base"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
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
              placeholder="Add details..."
              className="text-base resize-y min-h-[100px]"
              style={{ fontSize: "16px" }}
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
              className="text-base"
              style={{ fontSize: "16px" }}
            />
          </div>

          {/* Project */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Folder size={16} />
              Project
            </label>
            <Select
              value={projectId || "none"}
              onValueChange={(val) => {
                setProjectId(val === "none" ? null : val);
                setIsDirty(true);
              }}
            >
              <SelectTrigger className="text-sm">
                <SelectValue>
                  {projectId
                    ? projects.find((p) => p.id === projectId)?.name
                    : "No Project"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">No Project</span>
                </SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scopes */}
          {orgId && (
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Scopes
              </label>
              <ScopePicker entityType="task" entityId={task.id} orgId={orgId} />
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Flag size={16} />
              Priority
            </label>
            <Select
              value={priority || "none"}
              onValueChange={(val) => {
                setPriority(val === "none" ? null : (val as any));
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

          {/* Subtasks */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Subtasks{" "}
              {totalSubtasks > 0 && `(${completedSubtasks}/${totalSubtasks})`}
            </label>
            <div className="space-y-2">
              {subtasks.map((subtask: any) => (
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
                    className="h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-2">
                <Input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder="Add a subtask..."
                  disabled={isAddingSubtask}
                  className="text-base flex-1"
                  style={{ fontSize: "16px" }}
                  onFocus={(e) => {
                    setTimeout(() => {
                      e.target.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }, 300);
                  }}
                  onKeyPress={(e) =>
                    e.key === "Enter" && !e.shiftKey && handleAddSubtask()
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleAddSubtask}
                  disabled={isAddingSubtask || !newSubtask.trim()}
                  className="h-8 w-8 flex-shrink-0 rounded-full"
                >
                  {isAddingSubtask ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                </Button>
              </div>
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
  );
}
