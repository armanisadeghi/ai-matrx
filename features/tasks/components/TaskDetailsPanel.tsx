"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  Calendar,
  Flag,
  User,
  Paperclip,
  MessageSquare,
  CheckSquare,
  Loader2,
  Plus,
  Send,
  Save,
  X as XIcon,
  ChevronLeft,
  Trash2,
  Check,
  MoreVertical,
  Share2,
  ExternalLink,
  Copy,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { selectProjects } from "@/features/tasks/redux/selectors";
import {
  updateTaskFieldThunk,
  toggleTaskCompleteThunk,
  deleteTaskThunk,
  moveTaskThunk,
} from "@/features/tasks/redux/thunks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import * as taskService from "@/features/tasks/services/taskService";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import TaskAttachments from "./TaskAttachments";
import TaskLabels from "./TaskLabels";
import type { TaskLabel } from "@/features/tasks/services/taskService";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import {
  EMPTY_SELECTION,
  type HierarchySelection,
} from "@/features/agent-context/components/hierarchy-selection/types";
import { ScopePicker } from "@/features/agent-context/components/ScopePicker";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

interface TaskDetailsPanelProps {
  task: any;
  onClose: () => void;
}

export default function TaskDetailsPanel({
  task,
  onClose,
}: TaskDetailsPanelProps) {
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectProjects);
  const refresh = () => dispatch(invalidateAndRefetchFullContext());
  const getTaskComments = (taskId: string) =>
    taskService.getTaskComments(taskId);
  const createTaskComment = async (taskId: string, content: string) => {
    await taskService.createTaskComment(taskId, content);
  };
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
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const { id: currentUserId } = useAppSelector(selectUser);
  const orgId = useAppSelector(selectOrganizationId);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [labels, setLabels] = useState<TaskLabel[]>(
    (task.settings?.labels as TaskLabel[]) || [],
  );
  const [showDescPreview, setShowDescPreview] = useState(false);

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(task.id);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  };

  // Update local state when task changes from context
  useEffect(() => {
    setTitle(task.title || "");
    setDescription(task.description || "");
    setDueDate(task.dueDate || "");
    setProjectId(task.projectId || null);
    setPriority(task.priority || null);
    setIsDirty(false); // Reset dirty state when task updates
  }, [
    task.id,
    task.title,
    task.description,
    task.dueDate,
    task.projectId,
    task.priority,
  ]);

  // Load comments when task changes
  useEffect(() => {
    let cancelled = false;
    setIsLoadingComments(true);
    taskService.getTaskComments(task.id).then((data) => {
      if (cancelled) return;
      setComments(data);
      setIsLoadingComments(false);
    });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setIsDirty(true);
  };

  const handleDescriptionChange = (newDescription: string) => {
    setDescription(newDescription);
    setIsDirty(true);
  };

  const handleDueDateChange = (newDate: string) => {
    setDueDate(newDate);
    setIsDirty(true);
  };

  const handleProjectChange = (newProjectId: string) => {
    setProjectId(newProjectId);
    setIsDirty(true);
  };

  const handlePriorityChange = (newPriority: "low" | "medium" | "high") => {
    setPriority(newPriority);
    setIsDirty(true);
  };

  const handleToggleComplete = async () => {
    await dispatch(toggleTaskCompleteThunk({ taskId: task.id }));
    await refresh();
  };

  const handleDelete = async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await dispatch(
        deleteTaskThunk({ taskId: task.id, projectId: task.projectId }),
      );
      onClose();
    } catch (error) {
      console.error("Error deleting task:", error);
    } finally {
      setIsDeleting(false);
    }
  };

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
      const prevLabels: TaskLabel[] =
        (task.settings?.labels as TaskLabel[]) || [];
      if (JSON.stringify(labels) !== JSON.stringify(prevLabels)) {
        await taskService.updateTaskLabels(task.id, labels);
      }

      // Refresh to get updated data
      await refresh();
      setIsDirty(false);
    } catch (error) {
      console.error("Error saving task:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim() || isAddingSubtask) return;

    setIsAddingSubtask(true);
    try {
      await createSubtask(task.id, newSubtask);
      setNewSubtask("");
      // Refresh to get updated subtasks
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
      // Refresh to get updated subtasks
      await refresh();
    } catch (error) {
      console.error("Error toggling subtask:", error);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      await deleteSubtask(subtaskId);
      // Refresh to get updated subtasks
      await refresh();
    } catch (error) {
      console.error("Error deleting subtask:", error);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || isAddingComment) return;

    setIsAddingComment(true);
    try {
      await createTaskComment(task.id, newComment);
      setNewComment("");
      // Reload comments
      const updatedComments = await getTaskComments(task.id);
      setComments(updatedComments);
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setIsAddingComment(false);
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
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter((st: any) => st.completed).length;
  const totalSubtasks = subtasks.length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-start gap-3 mb-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="flex-shrink-0 h-7 w-7 rounded-full"
          >
            <ChevronLeft size={18} />
          </Button>

          {/* Complete/Incomplete Checkbox */}
          <Checkbox
            checked={task.completed}
            onCheckedChange={handleToggleComplete}
            className="mt-1.5 flex-shrink-0"
          />

          {/* Title - Editable */}
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <Input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setIsEditingTitle(false);
                  }
                  if (e.key === "Escape") {
                    setTitle(task.title);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                className="text-lg font-semibold"
              />
            ) : (
              <h2
                className={`text-lg font-semibold cursor-pointer hover:text-primary transition-colors ${
                  task.completed
                    ? "line-through text-muted-foreground"
                    : "text-foreground"
                }`}
                onClick={() => setIsEditingTitle(true)}
              >
                {task.title}
              </h2>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Open full page */}
            <Link
              href={`/tasks/${task.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open task in full page"
              className="inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink size={14} />
            </Link>

            {isDirty && (
              <Button
                onClick={handleSave}
                disabled={isSaving}
                size="sm"
                className="h-8 px-3"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-1" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={14} className="mr-1" />
                    Save
                  </>
                )}
              </Button>
            )}

            <ShareButton
              resourceType="task"
              resourceId={task.id}
              resourceName={task.title}
              isOwner={task.userId === currentUserId}
              size="icon"
              variant="ghost"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                >
                  <MoreVertical size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleToggleComplete}
                  className="flex items-center gap-2"
                >
                  <Check size={14} />
                  {task.completed ? "Mark Incomplete" : "Mark Complete"}
                </DropdownMenuItem>
                {task.userId === currentUserId && (
                  <DropdownMenuItem
                    onClick={() => setIsShareModalOpen(true)}
                    className="flex items-center gap-2"
                  >
                    <Share2 size={14} />
                    Share Task
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-2 text-destructive focus:text-destructive"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      Delete Task
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Assignee */}
        <div>
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2 mb-2">
            <User size={14} />
            Assignee
          </label>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium">
              {task.assigneeName?.[0] || "U"}
            </div>
            <span>{task.assigneeName || "Unassigned"}</span>
          </div>
        </div>

        {/* Due Date */}
        <div>
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2 mb-2">
            <Calendar size={14} />
            Due Date
          </label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => handleDueDateChange(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Hierarchy: Org → Project */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <CheckSquare size={14} />
            Project
          </label>

          <HierarchyCascade
            levels={["organization", "scope", "project"]}
            value={{
              ...EMPTY_SELECTION,
              organizationId: null,
              projectId: projectId || null,
            }}
            onChange={(sel: HierarchySelection) => {
              if (sel.projectId !== (projectId || null)) {
                handleProjectChange(sel.projectId ?? "");
              }
            }}
            layout="vertical"
            requireProject
          />
        </div>

        {/* Scopes — tag this task with scope values for filtering / context */}
        {orgId && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
              Scopes
            </label>
            <ScopePicker entityType="task" entityId={task.id} orgId={orgId} />
          </div>
        )}

        {/* Priority */}
        <div>
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2 mb-2">
            <Flag size={14} />
            Priority
          </label>
          <Select
            value={priority || "none"}
            onValueChange={(val) => handlePriorityChange(val as any)}
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

        {/* Task ID */}
        <div>
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
            Task ID
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyId}
              className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors max-w-full"
              title="Copy task ID"
            >
              {idCopied ? (
                <Check size={11} className="text-green-500 flex-shrink-0" />
              ) : (
                <Copy size={11} className="flex-shrink-0" />
              )}
              <span className="truncate">{task.id}</span>
            </button>
            <Link
              href={`/tasks/${task.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0"
            >
              <ExternalLink size={11} />
              Open
            </Link>
          </div>
        </div>

        {/* Labels */}
        <div>
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
            Labels
          </label>
          <TaskLabels
            labels={labels}
            onChange={(next) => {
              setLabels(next);
              setIsDirty(true);
            }}
          />
        </div>

        {/* Description */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
              Description
            </label>
            <button
              type="button"
              onClick={() => setShowDescPreview((p) => !p)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDescPreview ? "Edit" : "Preview"}
            </button>
          </div>
          {showDescPreview ? (
            <div className="text-sm text-foreground prose prose-sm dark:prose-invert max-w-none min-h-[100px] p-2 bg-muted/40 rounded-md border border-border overflow-auto whitespace-pre-wrap">
              {description || (
                <span className="text-muted-foreground italic">
                  No description
                </span>
              )}
            </div>
          ) : (
            <Textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Add a description… Markdown is supported"
              className="text-sm resize-y min-h-[100px]"
            />
          )}
        </div>

        {/* Attachments */}
        <TaskAttachments taskId={task.id} />

        {/* Subtasks */}
        <div>
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
            Subtasks{" "}
            {totalSubtasks > 0 && `(${completedSubtasks}/${totalSubtasks})`}
          </label>
          <div className="space-y-2">
            {subtasks.map((subtask: any) => (
              <div key={subtask.id} className="flex items-center gap-2 group">
                <Checkbox
                  checked={subtask.completed}
                  onCheckedChange={() => handleToggleSubtask(subtask.id)}
                />
                <span
                  className={`text-sm flex-1 ${subtask.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
                >
                  {subtask.title}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDeleteSubtask(subtask.id)}
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
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
                className="text-sm flex-1"
                onKeyPress={(e) =>
                  e.key === "Enter" && !e.shiftKey && handleAddSubtask()
                }
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleAddSubtask}
                disabled={isAddingSubtask}
                className="h-7 w-7 rounded-full"
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

        {/* Activity / Comments */}
        <div>
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2 mb-2">
            <MessageSquare size={14} />
            Activity {comments.length > 0 && `(${comments.length})`}
          </label>

          {isLoadingComments ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No comments yet.
            </p>
          ) : (
            <div className="space-y-3 max-h-[200px] overflow-y-auto">
              {comments.map((comment) => {
                const isCurrentUser = comment.user_id === currentUserId;
                const displayName = isCurrentUser ? "You" : "User";
                const initial = isCurrentUser ? "Y" : "U";

                return (
                  <div key={comment.id} className="text-sm">
                    <div className="flex items-start gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-xs font-medium">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {displayName}
                          </p>
                          <p className="text-xs text-muted-foreground/80">
                            {new Date(comment.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="text-foreground mt-1 break-words">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              disabled={isAddingComment}
              className="text-sm flex-1"
              onKeyPress={(e) =>
                e.key === "Enter" && !e.shiftKey && handleAddComment()
              }
            />
            <Button
              size="icon"
              onClick={handleAddComment}
              disabled={!newComment.trim() || isAddingComment}
              className="h-7 w-7 rounded-full"
            >
              {isAddingComment ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </Button>
          </div>
        </div>
      </div>

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        resourceType="task"
        resourceId={task.id}
        resourceName={task.title}
        isOwner={task.userId === currentUserId}
      />
    </div>
  );
}
