"use client";

import React, { useEffect, useMemo, useState } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import {
  Link2,
  Search,
  Plus,
  Loader2,
  Check,
  X,
  CircleDashed,
  CheckCircle2,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import {
  useAssociateTask,
  type TaskSource,
} from "@/features/tasks/hooks/useAssociateTask";
import { selectAllTasksFlat } from "@/features/tasks/redux/selectors";
import {
  fetchTasksForEntity,
  selectTasksForEntity,
} from "@/features/tasks/redux/taskAssociationsSlice";
import { fetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { selectFullContextStatus } from "@/features/agent-context/redux/hierarchySlice";
import type { TaskWithProject } from "@/features/tasks/types";

export interface AssociateTaskButtonProps {
  /** What we are associating. Writes a platform.associations edge on pick. */
  entityType: string;
  entityId: string;
  /** Stored on the association row (displayed in the task's attachments panel) */
  label?: string;
  /** Freeform context captured on the association row */
  metadata?: Record<string, unknown>;
  /** Pre-fill for the "create new" path */
  prePopulate?: {
    title?: string;
    description?: string;
    priority?: "low" | "medium" | "high";
  };
  /** Visual variant */
  variant?: "icon" | "button" | "menu-item";
  size?: "sm" | "md" | "lg";
  label_text?: string;
  className?: string;
  onAssociated?: (taskId: string) => void;
}

/**
 * The universal "attach to a task" button. Takes an entity (table + id) and
 * opens a popover with: search existing tasks, or create a new one. Both
 * paths write a canonical platform.associations edge (via associate_with_task) and dispatch the linkage thunks
 * so the attachments panel + reverse-lookup chip rows update immediately.
 *
 * Drop it anywhere — no providers required.
 *   <AssociateTaskButton entityType="message" entityId={msg.id} label={msg.content.slice(0, 160)} />
 */
export default function AssociateTaskButton(props: AssociateTaskButtonProps) {
  const {
    entityType,
    entityId,
    label,
    metadata,
    prePopulate,
    variant = "icon",
    size = "md",
    label_text = "Attach to task",
    className,
    onAssociated,
  } = props;

  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const allTasks = useAppSelector(selectAllTasksFlat);
  const hierarchyStatus = useAppSelector(selectFullContextStatus);
  const existing = useAppSelector(selectTasksForEntity(entityType, entityId));
  const existingIds = useMemo(
    () => new Set(existing.map((x) => x.task_id)),
    [existing],
  );

  const { associate, dissociate, createAndAssociate, isBusy } =
    useAssociateTask();

  useEffect(() => {
    if (open) {
      // Task suggestions read from selectAllTasksFlat, which depends on
      // fetchFullContext() hydrating the agent-context tasks slice.
      dispatch(fetchFullContext() as never);
      dispatch(fetchTasksForEntity({ entityType, entityId }));
    }
  }, [open, dispatch, entityType, entityId]);

  // Filter tasks: incomplete first, matching query
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? allTasks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.description?.toLowerCase().includes(q) ||
            idMatchesQuery(t, q),
        )
      : allTasks;
    const open = base.filter((t) => !t.completed);
    const done = base.filter((t) => t.completed);
    return [...open, ...done].slice(0, 20);
  }, [allTasks, query]);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
      setShowCreate(false);
      setNewTitle("");
      setNewDescription("");
      return;
    }
    if (prePopulate?.title) setNewTitle(prePopulate.title);
    if (prePopulate?.description) setNewDescription(prePopulate.description);
  }, [open, prePopulate]);

  const handlePick = async (task: TaskWithProject) => {
    const source: TaskSource = {
      entity_type: entityType,
      entity_id: entityId,
      label,
      metadata,
    };
    if (existingIds.has(task.id)) {
      await dissociate(task.id, source);
    } else {
      await associate(task.id, source);
      onAssociated?.(task.id);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const source: TaskSource = {
      entity_type: entityType,
      entity_id: entityId,
      label: label ?? newTitle.trim(),
      metadata,
    };
    const taskId = await createAndAssociate({
      title: newTitle.trim(),
      description: newDescription.trim() || null,
      priority: prePopulate?.priority ?? null,
      source,
    });
    if (taskId) {
      onAssociated?.(taskId);
      setOpen(false);
    }
  };

  const triggerSize =
    size === "sm" ? "h-6 w-6" : size === "lg" ? "h-9 w-9" : "h-7 w-7";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            title={label_text}
            className={cn(
              "relative inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              triggerSize,
              existing.length > 0 && "text-primary",
              className,
            )}
          >
            <Link2 className="w-3.5 h-3.5" />
            {existing.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center px-1">
                {existing.length}
              </span>
            )}
          </button>
        ) : variant === "menu-item" ? (
          <button
            type="button"
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-accent rounded transition-colors",
              className,
            )}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>{label_text}</span>
            {existing.length > 0 && (
              <span className="ml-auto text-[10px] text-primary">
                {existing.length}
              </span>
            )}
          </button>
        ) : (
          <Button size="sm" variant="outline" className={cn("h-7", className)}>
            <Link2 className="w-3.5 h-3.5 mr-1" />
            {label_text}
            {existing.length > 0 && (
              <span className="ml-1.5 text-[10px] text-primary">
                ({existing.length})
              </span>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Currently linked tasks */}
        {existing.length > 0 && !showCreate && (
          <div className="px-2 py-1.5 border-b border-border/50">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Linked ({existing.length})
            </div>
            <div className="space-y-0.5 max-h-28 overflow-y-auto">
              {existing.map((link) => (
                <LinkedRow
                  key={link.association_id}
                  title={link.title}
                  status={link.status}
                  onRemove={() =>
                    dissociate(link.task_id, {
                      entity_type: entityType,
                      entity_id: entityId,
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Search + suggestions */}
        {!showCreate && (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50">
              <Search className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a task..."
                className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {isBusy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Working...
                </div>
              )}
              {hierarchyStatus === "loading" && suggestions.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-3 justify-center">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading tasks...
                </div>
              ) : suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-3 text-center">
                  {query ? "No matches" : "No tasks yet"}
                </p>
              ) : (
                suggestions.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handlePick(t)}
                    disabled={isBusy}
                    className={cn(
                      "w-full flex items-start gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent/60 text-left",
                      existingIds.has(t.id) && "bg-primary/5",
                    )}
                  >
                    {t.completed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <CircleDashed className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "font-medium truncate",
                          t.completed && "line-through text-muted-foreground",
                        )}
                      >
                        {t.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {t.projectName}
                      </p>
                    </div>
                    {existingIds.has(t.id) && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    )}
                  </button>
                ))
              )}
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors border-t border-border/40 mt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Create new task
                {query && <span className="truncate">— "{query}"</span>}
              </button>
            </div>
          </>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Create new task
              </span>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <Input
              autoFocus
              value={newTitle || query}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Task title..."
              className="h-8 text-sm"
              style={{ fontSize: "16px" }}
            />
            <Textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="text-xs min-h-[50px] resize-y"
              rows={2}
            />
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newTitle.trim() && !query.trim()}
              className="w-full h-7 text-xs"
            >
              {isBusy ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Plus className="w-3 h-3 mr-1" />
              )}
              Create & attach
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function LinkedRow({
  title,
  status,
  onRemove,
}: {
  title: string;
  status: string;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-accent/40 transition-colors">
      {status === "completed" ? (
        <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
      ) : (
        <CircleDashed className="w-3 h-3 text-muted-foreground shrink-0" />
      )}
      <span className="flex-1 text-xs truncate">{title}</span>
      <button
        type="button"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        title="Remove link"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
