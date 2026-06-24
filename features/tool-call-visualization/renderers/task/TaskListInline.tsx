"use client";

import { useMemo } from "react";
import { CheckCircle2, Circle, CircleDashed, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolRendererProps } from "../../types";
import { parseTaskCollection } from "./parseTask";

/**
 * Inline renderer for the `tasks` / `user_todos` tools — the agent's lightweight
 * working list / personal todos (NOT ctx_tasks, so no per-item deep link).
 * Renders a clean status checklist straight from the result.
 */
export function TaskListInline({ entry }: ToolRendererProps) {
  const { items } = useMemo(() => parseTaskCollection(entry), [entry]);
  if (!items.length) return null;

  const done = items.filter((i) => i.status === "done").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <ListTodo className="h-4 w-4 text-primary" />
        <span>
          {items.length} {items.length === 1 ? "task" : "tasks"}
        </span>
        {done > 0 ? (
          <span className="text-xs text-muted-foreground">· {done} done</span>
        ) : null}
      </div>

      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((it, i) => (
          <div key={it.id ?? i} className="flex items-start gap-2 px-3 py-2">
            {it.status === "done" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : it.status === "in_progress" ? (
              <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm text-foreground",
                  it.status === "done" && "text-muted-foreground line-through",
                )}
              >
                {it.title}
              </p>
              {it.note ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {it.note}
                </p>
              ) : null}
              {it.due ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Due {it.due}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
