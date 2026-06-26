"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Flag,
  User,
  MessageSquare,
  CheckSquare,
  Loader2,
  Save,
  X,
  ChevronRight,
  Trash2,
  Check,
  MoreVertical,
  Share2,
  Copy,
  ExternalLink,
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
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";
import * as taskService from "@/features/tasks/services/taskService";
import TaskAttachmentsPanel from "./TaskAttachmentsPanel";
import TaskLabels from "./TaskLabels";
import type { TaskLabel } from "@/features/tasks/services/taskService";
import type { Comment } from "@/features/comments/types";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import { useToastManager } from "@/hooks/useToastManager";
import type { TaskWithProject } from "@/features/tasks/types";
import Link from "next/link";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import {
  EMPTY_SELECTION,
  type HierarchySelection,
} from "@/features/agent-context/components/hierarchy-selection/types";
import { ScopePicker } from "@/features/agent-context/components/ScopePicker";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";

interface TaskDetailPageProps {
  task: TaskWithProject;
}

function getPriorityColor(p: string | null) {
  switch (p) {
    case "high":
      return "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800";
    case "medium":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    case "low":
      return "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function TaskDetailPage({ task }: TaskDetailPageProps) {
  const router = useRouter();
  const toast = useToastManager("tasks");

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
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const { inputRef: subtaskInputRef, scheduleRefocus: scheduleSubtaskRefocus } =
    useRefocusInputAfterAsync(isAddingSubtask);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [labels, setLabels] = useState<TaskLabel[]>(
    (task as any).settings?.labels || [],
  );
  const [showDescPreview, setShowDescPreview] = useState(false);

  const { id: currentUserId } = useAppSelector(selectUser);
  const orgId = useAppSelector(selectOrganizationId);

  // Sync local state when task updates from context
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

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      if (title !== task.title)
        await dispatch(
          updateTaskFieldThunk({ taskId: task.id, patch: { title } }),
        );
      if (description !== task.description)
        await dispatch(
          updateTaskFieldThunk({ taskId: task.id, patch: { description } }),
        );
      if (dueDate !== task.dueDate)
        await dispatch(
          updateTaskFieldThunk({
            taskId: task.id,
            patch: { due_date: dueDate || null },
          }),
        );
      if (projectId !== task.projectId)
        await dispatch(
          moveTaskThunk({
            taskId: task.id,
            fromProjectId: task.projectId,
            toProjectId: projectId,
          }),
        );
      if (priority !== task.priority)
        await dispatch(
          updateTaskFieldThunk({ taskId: task.id, patch: { priority } }),
        );
      const prevLabels: TaskLabel[] = (task as any).settings?.labels || [];
      if (JSON.stringify(labels) !== JSON.stringify(prevLabels))
        await taskService.updateTaskLabels(task.id, labels);
      await refresh();
      setIsDirty(false);
    } catch (error) {
      console.error("Error saving task:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleComplete = async () => {
    await dispatch(toggleTaskCompleteThunk({ taskId: task.id }));
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await dispatch(
        deleteTaskThunk({ taskId: task.id, projectId: task.projectId }),
      );
      router.push("/tasks");
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
      scheduleSubtaskRefocus();
      await refresh();
    } catch (error) {
      console.error("Error adding subtask:", error);
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string) => {
    const subtask = task.subtasks?.find((st) => st.id === subtaskId);
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

  const handleAddComment = async () => {
    if (!newComment.trim() || isAddingComment) return;
    setIsAddingComment(true);
    try {
      await createTaskComment(task.id, newComment);
      setNewComment("");
      const updated = await getTaskComments(task.id);
      setComments(updated);
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(task.id);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  };

  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter((st) => st.completed).length;
  const totalSubtasks = subtasks.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-8 px-2 gap-1.5 text-muted-foreground"
        >
          <Link href="/tasks">
            <ArrowLeft size={15} />
            Tasks
          </Link>
        </Button>

        <ChevronRight size={14} className="text-muted-foreground/50" />

        {/* Breadcrumb project */}
        {task.projectName && (
          <>
            <span className="text-sm text-muted-foreground">
              {task.projectName}
            </span>
            <ChevronRight size={14} className="text-muted-foreground/50" />
          </>
        )}

        <span className="text-sm text-foreground font-medium truncate max-w-xs">
          {task.title}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Task ID chip */}
          <button
            onClick={handleCopyId}
            title="Copy task ID"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors text-xs font-mono text-muted-foreground"
          >
            {idCopied ? (
              <Check size={11} className="text-green-500" />
            ) : (
              <Copy size={11} />
            )}
            <span>{task.id.slice(0, 8)}…</span>
          </button>

          {isDirty && (
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="sm"
              className="h-8 px-3"
            >
              {isSaving ? (
                <>
                  <Loader2 size={13} className="animate-spin mr-1.5" />
                  Saving…
                </>
              ) : (
                <>
                  <Save size={13} className="mr-1.5" />
                  Save
                </>
              )}
            </Button>
          )}

          <ReferenceCopyButton
            referenceType="task"
            id={task.id}
            label={task.title}
            toastLabel={task.title}
            size="md"
            className="h-8 w-8"
          />

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
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical size={15} />
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
                    Deleting…
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

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Primary content */}
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
          {/* Title + status */}
          <div className="flex items-start gap-3 mb-6">
            <Checkbox
              checked={task.completed}
              onCheckedChange={handleToggleComplete}
              className="mt-1.5 flex-shrink-0 h-5 w-5"
            />
            <div className="flex-1 min-w-0">
              {isEditingTitle ? (
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setIsDirty(true);
                  }}
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setIsEditingTitle(false);
                    if (e.key === "Escape") {
                      setTitle(task.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  autoFocus
                  className="text-2xl font-bold h-auto py-0 px-1 border-none shadow-none focus-visible:ring-0"
                />
              ) : (
                <h1
                  onClick={() => setIsEditingTitle(true)}
                  className={`text-2xl font-bold cursor-pointer hover:text-primary transition-colors leading-snug ${
                    task.completed
                      ? "line-through text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {task.title}
                </h1>
              )}

              {/* Full UUID row */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground/60 font-mono">
                  {task.id}
                </span>
                <button
                  onClick={handleCopyId}
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  {idCopied ? (
                    <Check size={11} className="text-green-500" />
                  ) : (
                    <Copy size={11} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Labels */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
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
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
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
              <div className="text-sm text-foreground min-h-[120px] p-3 bg-muted/40 rounded-md border border-border whitespace-pre-wrap">
                {description || (
                  <span className="text-muted-foreground italic">
                    No description
                  </span>
                )}
              </div>
            ) : (
              <ProTextarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Add a description… Markdown is supported"
                autoGrow
                minHeight={120}
                maxHeight={320}
                showCopyButton
                className="text-sm resize-y min-h-[120px]"
                wrapperClassName="w-full"
              />
            )}
          </div>

          {/* Attachments */}
          <div className="mb-6">
            <TaskAttachmentsPanel taskId={task.id} />
          </div>

          {/* Subtasks */}
          <div className="mb-6">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Subtasks{" "}
              {totalSubtasks > 0 && `(${completedSubtasks}/${totalSubtasks})`}
            </label>

            {totalSubtasks > 0 && (
              <div className="space-y-2 mb-3">
                {subtasks.map((subtask) => (
                  <div
                    key={subtask.id}
                    className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={subtask.completed}
                      onCheckedChange={() => handleToggleSubtask(subtask.id)}
                    />
                    <span
                      className={`text-sm flex-1 ${subtask.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
                    >
                      {subtask.title}
                    </span>
                    <button
                      onClick={() => handleDeleteSubtask(subtask.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
              placeholder="Add a subtask…"
              disabled={isAddingSubtask}
              className="text-sm flex-1"
              wrapperClassName="flex-1 min-w-0"
            />
          </div>

          {/* Activity / Comments */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2 mb-3">
              <MessageSquare size={13} />
              Activity {comments.length > 0 && `(${comments.length})`}
            </label>

            {isLoadingComments ? (
              <div className="flex items-center justify-center py-6">
                <Loader2
                  size={20}
                  className="animate-spin text-muted-foreground"
                />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No comments yet.
              </p>
            ) : (
              <div className="space-y-4 mb-4">
                {comments.map((comment) => {
                  const isMe = comment.createdBy === currentUserId;
                  const authorName =
                    comment.author.displayName ?? comment.author.email ?? null;
                  const displayName = isMe ? "You" : (authorName ?? "User");
                  return (
                    <div
                      key={comment.id}
                      className="flex items-start gap-3 text-sm"
                    >
                      <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-xs font-medium">
                        {(displayName[0] ?? "U").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            {displayName}
                          </span>
                          <span className="text-xs text-muted-foreground/60">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-foreground break-words">
                          {comment.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <ProTextarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onSubmit={() => void handleAddComment()}
              submitOnEnter
              submitLabel="Post comment"
              submitDisabled={!newComment.trim() || isAddingComment}
              isSubmitting={isAddingComment}
              showCopyButton={false}
              placeholder="Write a comment…"
              disabled={isAddingComment}
              autoGrow
              minHeight={56}
              maxHeight={160}
              className="text-sm"
              wrapperClassName="w-full"
            />
          </div>
        </div>

        {/* Right sidebar — metadata */}
        <div className="w-72 flex-shrink-0 border-l border-border bg-card overflow-y-auto p-4 space-y-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Details
          </h3>

          {/* Labels (sidebar quick-view) */}
          {labels.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
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
          )}

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Status
            </label>
            <button
              onClick={handleToggleComplete}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                task.completed
                  ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
              }`}
            >
              {task.completed ? (
                <Check size={11} />
              ) : (
                <div className="h-2.5 w-2.5 rounded-full border border-current" />
              )}
              {task.completed ? "Completed" : "Incomplete"}
            </button>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Flag size={12} /> Priority
            </label>
            <Select
              value={priority || "none"}
              onValueChange={(val) => {
                setPriority(
                  val === "none" ? null : (val as "low" | "medium" | "high"),
                );
                setIsDirty(true);
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(priority)}`}
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
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    High
                  </span>
                </SelectItem>
                <SelectItem value="medium">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                    Medium
                  </span>
                </SelectItem>
                <SelectItem value="low">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                    Low
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Calendar size={12} /> Due Date
            </label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setIsDirty(true);
              }}
              className="h-8 text-xs"
            />
          </div>

          {/* Project */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <CheckSquare size={12} /> Project
            </label>
            <HierarchyCascade
              levels={["organization", "scope", "project"]}
              value={{
                ...EMPTY_SELECTION,
                projectId: projectId || null,
              }}
              onChange={(sel: HierarchySelection) => {
                if (sel.projectId !== (projectId || null)) {
                  setProjectId(sel.projectId);
                  setIsDirty(true);
                }
              }}
              layout="vertical"
            />
          </div>

          {/* Scopes */}
          {orgId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Scopes
              </label>
              <ScopePicker entityType="task" entityId={task.id} orgId={orgId} />
            </div>
          )}

          {/* Assignee */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <User size={12} /> Assignee
            </label>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium flex-shrink-0">
                {task.assigneeName?.[0] || "U"}
              </div>
              <span className="text-sm text-foreground">
                {task.assigneeName || "Unassigned"}
              </span>
            </div>
          </div>

          {/* Timestamps */}
          <div className="pt-2 border-t border-border space-y-2">
            {task.updatedAt && (
              <div>
                <span className="text-xs text-muted-foreground/60 block">
                  Last updated
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(task.updatedAt).toLocaleString()}
                </span>
              </div>
            )}
            <div>
              <span className="text-xs text-muted-foreground/60 block">
                Task ID
              </span>
              <button
                onClick={handleCopyId}
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                {idCopied ? (
                  <Check size={10} className="text-green-500" />
                ) : (
                  <Copy size={10} />
                )}
                <span className="break-all">{task.id}</span>
              </button>
            </div>
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
