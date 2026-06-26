"use client";

// features/war-room/components/shared/WarRoomTaskPicker.tsx
//
// Pick ANY of the user's tasks for a task-anchored thread — flat, searchable,
// with inline create (opens the shared task quick-create window).

import { useState } from "react";
import {
  ListChecks,
  Check,
  ChevronDown,
  Search,
  X,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useTasks } from "@/features/tasks/hooks/useTaskManager";
import { getTaskById } from "@/features/tasks/services/taskService";
import { useOpenTaskQuickCreateWindow } from "@/features/overlays/openers/taskQuickCreateWindow";
import { cn } from "@/lib/utils";

export function WarRoomTaskPicker({
  value,
  onSelect,
  placeholder = "Choose a task…",
  allowClear = true,
  className,
}: {
  value: string | null;
  onSelect: (taskId: string | null, taskTitle: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
}) {
  const { tasks, loading, refresh } = useTasks();
  const openCreateTask = useOpenTaskQuickCreateWindow();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [optimistic, setOptimistic] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const selected =
    tasks.find((t) => t.id === value) ??
    (optimistic && optimistic.id === value ? optimistic : null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? tasks.filter((t) => (t.title ?? "").toLowerCase().includes(q))
    : tasks;

  const handleCreateTask = () => {
    setOpen(false);
    const prefill = query.trim();
    openCreateTask({
      prePopulate: prefill ? { title: prefill } : undefined,
      onSaved: async (taskId) => {
        const row = await getTaskById(taskId);
        const title = row?.title?.trim() || prefill || "Untitled task";
        setOptimistic({ id: taskId, title });
        onSelect(taskId, title);
        refresh();
      },
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            className,
          )}
        >
          <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              selected ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {selected ? selected.title?.trim() || "Untitled task" : placeholder}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            style={{ fontSize: "16px" }}
            aria-label="Search tasks"
          />
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Refresh tasks"
            aria-label="Refresh tasks"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {loading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Loading tasks…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {tasks.length === 0 ? "No tasks yet." : "No match."}
            </p>
          ) : (
            filtered.map((t) => {
              const active = t.id === value;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelect(t.id, t.title?.trim() || "Untitled task");
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    active && "bg-accent/60",
                  )}
                >
                  <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {t.title?.trim() || "Untitled task"}
                  </span>
                  {active ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-border p-1">
          <button
            type="button"
            onClick={handleCreateTask}
            className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Plus className="size-3.5 shrink-0 text-primary" />
            Create new task
          </button>
          {allowClear && value ? (
            <button
              type="button"
              onClick={() => {
                onSelect(null, null);
                setOptimistic(null);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" />
              Clear selection
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
