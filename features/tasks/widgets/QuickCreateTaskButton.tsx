"use client";

import React, { useState, useEffect } from "react";
import { Plus, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
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
import { selectProjects } from "@/features/tasks/redux/selectors";

export interface QuickCreateTaskButtonProps {
  /** What we're creating the task from (optional — records an association). */
  source?: TaskSource;
  /** Pre-fill fields */
  prePopulate?: {
    title?: string;
    description?: string;
    priority?: "low" | "medium" | "high";
  };
  /** Override project default */
  defaultProjectId?: string;
  /** Visual variant */
  variant?: "icon" | "button" | "menu-item";
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  onCreated?: (taskId: string) => void;
  /** Render a custom trigger inside the PopoverTrigger */
  triggerChildren?: React.ReactNode;
}

/**
 * The universal "create task" button. Drop anywhere — no providers required.
 * Opens a compact popover with a single-line create form and an optional
 * "More details" expander. Creates via `useAssociateTask` so the resulting
 * task shows up instantly in /tasks and any TaskChipRow consumers.
 */
export default function QuickCreateTaskButton(props: QuickCreateTaskButtonProps) {
  const {
    source,
    prePopulate,
    defaultProjectId,
    variant = "icon",
    size = "md",
    label = "Create task",
    className,
    onCreated,
    triggerChildren,
  } = props;

  const [open, setOpen] = useState(false);
  const projects = useAppSelector(selectProjects);
  const { createAndAssociate, isBusy } = useAssociateTask();

  const [title, setTitle] = useState(prePopulate?.title ?? "");
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState(prePopulate?.description ?? "");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "">(
    prePopulate?.priority ?? "",
  );
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");

  useEffect(() => {
    if (!open) return;
    setTitle(prePopulate?.title ?? "");
    setDescription(prePopulate?.description ?? "");
    setPriority(prePopulate?.priority ?? "");
    setDueDate("");
    setProjectId(defaultProjectId ?? "");
    setExpanded(false);
  }, [open, prePopulate, defaultProjectId]);

  const submit = async () => {
    if (!title.trim()) return;
    const created = await createAndAssociate({
      title: title.trim(),
      description: description.trim() || null,
      priority: (priority || null) as "low" | "medium" | "high" | null,
      due_date: dueDate || null,
      project_id: projectId || undefined,
      source,
    });
    if (created) {
      onCreated?.(created.taskId);
      setOpen(false);
    }
  };

  const triggerSize =
    size === "sm" ? "h-6 w-6" : size === "lg" ? "h-9 w-9" : "h-7 w-7";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerChildren ? (
          <span>{triggerChildren}</span>
        ) : variant === "icon" ? (
          <button
            type="button"
            title={label}
            className={cn(
              "inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              triggerSize,
              className,
            )}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        ) : variant === "menu-item" ? (
          <button
            type="button"
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-accent rounded transition-colors",
              className,
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ) : (
          <Button size="sm" variant="outline" className={cn("h-7", className)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            {label}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-2"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-2">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Task title..."
            className="h-8 text-sm"
            style={{ fontSize: "16px" }}
          />

          {expanded && (
            <div className="space-y-2">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="text-xs min-h-[50px] resize-y"
                rows={2}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as "low" | "medium" | "high" | "")
                  }
                  className="h-7 bg-card border border-border rounded px-2 text-xs outline-none hover:border-foreground/30"
                >
                  <option value="">No priority</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-7 bg-card border border-border rounded px-2 text-xs outline-none hover:border-foreground/30"
                />
              </div>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full h-7 bg-card border border-border rounded px-2 text-xs outline-none hover:border-foreground/30"
              >
                <option value="">Auto (active project)</option>
                {projects
                  .filter((p) => p.id !== "__unassigned__")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground rounded transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-2.5 h-2.5" /> Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-2.5 h-2.5" /> More
                </>
              )}
            </button>
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={submit}
              disabled={!title.trim() || isBusy}
              className="h-7 text-xs"
            >
              {isBusy ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Plus className="w-3 h-3 mr-1" />
              )}
              Create
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
