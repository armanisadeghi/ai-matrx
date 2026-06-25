// Task Item Component
import React from "react";
import {
  CheckCircle,
  Circle,
  ChevronDown,
  ChevronUp,
  Copy,
  Paperclip,
  Trash2,
  Calendar,
  Loader2,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectShowAllProjects,
  selectExpandedTasks,
  selectOperatingTaskId,
  toggleTaskExpand,
} from "@/features/tasks/redux/taskUiSlice";
import {
  toggleTaskCompleteThunk,
  updateTaskFieldThunk,
  deleteTaskThunk,
} from "@/features/tasks/redux/thunks";
import TaskDetails from "./TaskDetails";
import EditableTaskTitle from "./EditableTaskTitle";
import { ScopeTagsDisplay } from "@/features/agent-context/components/ScopeTagsDisplay";
import { ShareButton } from "@/features/sharing";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export default function TaskItem({
  task,
  depth = 0,
}: {
  task: any;
  depth?: number;
}) {
  const dispatch = useAppDispatch();
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const expandedTasks = useAppSelector(selectExpandedTasks);
  const operatingTaskId = useAppSelector(selectOperatingTaskId);
  const currentUserId = useAppSelector(selectUserId);

  const isOperating = operatingTaskId === task.id;

  const isPastDue =
    task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;
  const isExpanded = expandedTasks.includes(task.id);

  const handleSaveTitle = async (newTitle: string) => {
    await dispatch(
      updateTaskFieldThunk({ taskId: task.id, patch: { title: newTitle } }),
    );
  };

  const handleCopyTask = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${task.title}${task.description ? `\n${task.description}` : ""}${
      task.dueDate ? `\nDue: ${task.dueDate}` : ""
    }`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("[contenteditable]")
    ) {
      return;
    }
    dispatch(toggleTaskExpand(task.id));
  };

  return (
    <div
      className="relative bg-card rounded-lg border border-border overflow-hidden hover:border-border/80 transition-colors group cursor-pointer"
      onClick={handleCardClick}
    >
      {/* Loading overlay for operating task */}
      {isOperating && (
        <div className="absolute inset-0 bg-card/70 backdrop-blur-sm z-20 flex items-center justify-center rounded-lg">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      <div
        className={`px-3 py-2 ${isOperating ? "opacity-60 pointer-events-none" : ""}`}
      >
        <div className="flex items-start gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch(toggleTaskCompleteThunk({ taskId: task.id }));
            }}
            className="mt-0.5 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
          >
            {task.completed ? (
              <CheckCircle className="text-success" size={18} />
            ) : (
              <Circle size={18} />
            )}
          </button>

          <div className="flex-1 min-w-0">
            {showAllProjects && (
              <div className="text-xs mb-0.5 text-muted-foreground">
                {task.projectName}
              </div>
            )}

            <div className="flex items-center gap-2 mb-1">
              <EditableTaskTitle
                title={task.title}
                completed={task.completed}
                onSave={handleSaveTitle}
                onToggleComplete={() =>
                  dispatch(toggleTaskCompleteThunk({ taskId: task.id }))
                }
              />
            </div>

            {/* Task metadata */}
            {(task.dueDate ||
              (task.attachments && task.attachments.length > 0)) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {task.dueDate && (
                  <div
                    className={`flex items-center gap-1 ${
                      isPastDue ? "text-destructive font-medium" : ""
                    }`}
                  >
                    <Calendar size={12} />
                    <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                    {isPastDue && <span>(Overdue)</span>}
                  </div>
                )}
                {task.attachments && task.attachments.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Paperclip size={12} />
                    <span>{task.attachments.length}</span>
                  </div>
                )}
              </div>
            )}
            <ScopeTagsDisplay
              entityType="task"
              entityId={task.id}
              className="mt-1.5"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <div onClick={(e) => e.stopPropagation()}>
              <ReferenceCopyButton
                referenceType="task"
                id={task.id}
                label={task.title}
                toastLabel={task.title || "Task"}
                size="sm"
              />
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <ShareButton
                resourceType="task"
                resourceId={task.id}
                resourceName={task.title || "Task"}
                isOwner={Boolean(
                  currentUserId && task.userId === currentUserId,
                )}
                variant="ghost"
                size="icon"
                showStatus={false}
              />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopyTask(e);
              }}
              disabled={isOperating}
              className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-accent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title="Copy task"
            >
              <Copy size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.stopPropagation();
                dispatch(
                  deleteTaskThunk({
                    taskId: task.id,
                    projectId: task.projectId,
                  }),
                );
              }}
              disabled={isOperating}
              className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-accent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title="Delete task"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dispatch(toggleTaskExpand(task.id));
              }}
              disabled={isOperating}
              className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-accent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title={isExpanded ? "Hide details" : "Show details"}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && <TaskDetails task={task} />}

        {/* Subtasks */}
        {task.subtasks && task.subtasks.length > 0 && (
          <div className="mt-2 ml-6 space-y-2 border-l-2 border-border pl-3">
            {task.subtasks.map((subtask: any) => (
              <SubtaskItem
                key={subtask.id}
                subtask={subtask}
                parentTaskId={task.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Subtask component - simplified version for nested display
function SubtaskItem({
  subtask,
  parentTaskId,
}: {
  subtask: any;
  parentTaskId: string;
}) {
  const dispatch = useAppDispatch();
  const operatingTaskId = useAppSelector(selectOperatingTaskId);

  const isOperating = operatingTaskId === subtask.id;

  const isPastDue =
    subtask.dueDate &&
    new Date(subtask.dueDate) < new Date() &&
    !subtask.completed;

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("[contenteditable]")
    ) {
      return;
    }
  };

  const handleSaveTitle = async (newTitle: string) => {
    await dispatch(
      updateTaskFieldThunk({ taskId: subtask.id, patch: { title: newTitle } }),
    );
  };

  return (
    <div
      className="relative bg-muted rounded border border-border hover:border-border/80 transition-colors group"
      onClick={handleCardClick}
    >
      {/* Loading overlay for operating subtask */}
      {isOperating && (
        <div className="absolute inset-0 bg-muted/70 backdrop-blur-sm z-20 flex items-center justify-center rounded">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
      )}
      <div
        className={`px-2 py-1.5 ${isOperating ? "opacity-60 pointer-events-none" : ""}`}
      >
        <div className="flex items-start gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch(toggleTaskCompleteThunk({ taskId: subtask.id }));
            }}
            className="mt-0.5 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
          >
            {subtask.completed ? (
              <CheckCircle className="text-success" size={16} />
            ) : (
              <Circle size={16} />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <EditableTaskTitle
                title={subtask.title}
                completed={subtask.completed}
                onSave={handleSaveTitle}
                onToggleComplete={() =>
                  dispatch(toggleTaskCompleteThunk({ taskId: subtask.id }))
                }
              />
            </div>

            {/* Subtask metadata */}
            {subtask.dueDate && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                <div
                  className={`flex items-center gap-1 ${
                    isPastDue ? "text-destructive font-medium" : ""
                  }`}
                >
                  <Calendar size={10} />
                  <span>{new Date(subtask.dueDate).toLocaleDateString()}</span>
                  {isPastDue && <span>(Overdue)</span>}
                </div>
              </div>
            )}
          </div>

          {/* Subtask action buttons */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.stopPropagation();
                dispatch(
                  deleteTaskThunk({
                    taskId: subtask.id,
                    projectId: parentTaskId,
                  }),
                );
              }}
              disabled={isOperating}
              className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-accent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title="Delete subtask"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
