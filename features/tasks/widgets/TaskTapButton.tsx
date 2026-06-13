"use client";

import React, { useEffect, useMemo, useState } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import {
  CheckSquareTapButton,
  LinkTapButton,
} from "@/components/icons/tap-buttons";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Loader2,
  Search,
  Check,
  CircleDashed,
  CheckCircle2,
  X,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
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

type Variant = "glass" | "transparent" | "solid" | "group";

export interface TaskTapButtonProps {
  /** Tap-target variant — matches the group-style used in message action bars. */
  variant?: Variant;
  /** Disables the popover UX and becomes a plain "create" button when omitted. */
  entityType?: string;
  entityId?: string;
  label?: string;
  metadata?: Record<string, unknown>;
  /** Pre-fill the create form */
  prePopulate?: {
    title?: string;
    description?: string;
    priority?: "low" | "medium" | "high";
  };
  /** Called after link/create succeeds with the resolved task id */
  onAssociated?: (taskId: string) => void;
  /** Icon flavor: "check-square" for "task" or "link" for "attach to task". Default: check-square. */
  icon?: "check-square" | "link";
  className?: string;
  ariaLabel?: string;
}

/**
 * Drop-in TapTarget button that opens the full "attach-to-task" popover.
 *
 * Mirrors the transcription widget philosophy:
 *   - Same look & feel as `CopyTapButton`, `PencilTapButton`, etc.
 *   - Single-callback API (`onAssociated`) — all state lives inside the hook.
 *   - Renders a badge when the entity is already linked to N tasks.
 *
 * Drop next to any `TapTargetButtonGroup`:
 *     <TaskTapButton
 *       variant="group"
 *       entityType="message"
 *       entityId={messageId}
 *       label={content.slice(0, 160)}
 *     />
 */
export default function TaskTapButton(props: TaskTapButtonProps) {
  const {
    variant = "group",
    entityType,
    entityId,
    label,
    metadata,
    prePopulate,
    onAssociated,
    icon = "check-square",
    className,
    ariaLabel,
  } = props;

  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState(prePopulate?.title ?? "");
  const [newDescription, setNewDescription] = useState(
    prePopulate?.description ?? "",
  );

  const linked = useAppSelector((s) =>
    entityType && entityId ? selectTasksForEntity(entityType, entityId)(s) : [],
  );
  const allTasks = useAppSelector(selectAllTasksFlat);
  const hierarchyStatus = useAppSelector(selectFullContextStatus);
  const linkedIds = useMemo(
    () => new Set(linked.map((l) => l.task_id)),
    [linked],
  );
  const { associate, dissociate, createAndAssociate, isBusy } =
    useAssociateTask();

  useEffect(() => {
    if (open) {
      dispatch(fetchFullContext() as never);
      if (entityType && entityId) {
        dispatch(fetchTasksForEntity({ entityType, entityId }));
      }
    }
  }, [open, dispatch, entityType, entityId]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setShowCreate(false);
      setNewTitle(prePopulate?.title ?? "");
      setNewDescription(prePopulate?.description ?? "");
    }
  }, [open, prePopulate]);

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
    const active = base.filter((t) => !t.completed);
    const done = base.filter((t) => t.completed);
    return [...active, ...done].slice(0, 20);
  }, [allTasks, query]);

  const source: TaskSource | null =
    entityType && entityId
      ? { entity_type: entityType, entity_id: entityId, label, metadata }
      : null;

  const handlePick = async (taskId: string) => {
    if (!source) return;
    if (linkedIds.has(taskId)) {
      await dissociate(taskId, source);
    } else {
      await associate(taskId, source);
      onAssociated?.(taskId);
    }
  };

  const handleCreate = async () => {
    const title = (newTitle || query).trim();
    if (!title) return;
    const taskId = await createAndAssociate({
      title,
      description: newDescription.trim() || null,
      priority: prePopulate?.priority ?? null,
      source: source ?? undefined,
    });
    if (taskId) {
      onAssociated?.(taskId);
      setOpen(false);
    }
  };

  const TapButton = icon === "link" ? LinkTapButton : CheckSquareTapButton;
  const linkedCount = linked.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative inline-flex", className)}>
          <TapButton
            variant={variant}
            ariaLabel={
              ariaLabel ?? (entityType ? "Attach to task" : "Create task")
            }
            onClick={() => setOpen((v) => !v)}
            className={cn(linkedCount > 0 && "text-primary")}
          />
          {linkedCount > 0 && (
            <span className="pointer-events-none absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center px-1">
              {linkedCount}
            </span>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-80 p-0"
        align="end"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Already-linked chips */}
        {source && linked.length > 0 && !showCreate && (
          <div className="px-2 py-1.5 border-b border-border/50">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Linked ({linked.length})
            </div>
            <div className="space-y-0.5 max-h-28 overflow-y-auto">
              {linked.map((link) => (
                <div
                  key={link.association_id}
                  className="group flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-accent/40 transition-colors"
                >
                  {link.status === "completed" ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  ) : (
                    <CircleDashed className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 text-xs truncate">{link.title}</span>
                  <button
                    type="button"
                    onClick={() => dissociate(link.task_id, source)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    title="Unlink"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
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
                placeholder={source ? "Find a task..." : "New task title..."}
                className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
                style={{ fontSize: "16px" }}
              />
            </div>
            {source ? (
              <div className="max-h-64 overflow-y-auto py-1">
                {isBusy && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Working...
                  </div>
                )}
                {hierarchyStatus === "loading" && suggestions.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-3 justify-center">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading
                    tasks...
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
                      onClick={() => handlePick(t.id)}
                      disabled={isBusy}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent/60 text-left",
                        linkedIds.has(t.id) && "bg-primary/5",
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
                      {linkedIds.has(t.id) && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      )}
                    </button>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => {
                    setNewTitle(query || prePopulate?.title || "");
                    setShowCreate(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors border-t border-border/40 mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create new task
                  {query && <span className="truncate">— "{query}"</span>}
                </button>
              </div>
            ) : (
              // No source → quick-create mode only
              <div className="p-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    const title = query.trim();
                    if (!title) return;
                    const taskId = await createAndAssociate({ title });
                    if (taskId) {
                      onAssociated?.(taskId);
                      setOpen(false);
                    }
                  }}
                  disabled={!query.trim() || isBusy}
                  className="w-full h-7 text-xs"
                >
                  {isBusy ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Plus className="w-3 h-3 mr-1" />
                  )}
                  Create task
                </Button>
              </div>
            )}
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
              value={newTitle}
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
              disabled={(!newTitle.trim() && !query.trim()) || isBusy}
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
