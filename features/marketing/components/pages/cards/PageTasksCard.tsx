"use client";

/**
 * PageTasksCard — tasks are first-class on the page workspace: every task
 * associated with this canonical page in one place, with inline quick-add.
 * Pure consumer of the canonical task-association machinery
 * (taskAssociationsSlice reverse lookup + QuickCreateTaskButton) — no new
 * redux, no new RPCs.
 */

import { useEffect } from "react";
import Link from "next/link";
import { CalendarClock, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchTasksForEntity,
  selectTasksForEntity,
  selectTasksForEntityLoading,
} from "@/features/tasks/redux/taskAssociationsSlice";
import QuickCreateTaskButton from "@/features/tasks/widgets/QuickCreateTaskButton";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  formatDate,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import type { MarketingPage } from "@/features/marketing/types";
import { cn } from "@/lib/utils";

const STATUS_DONE = new Set(["completed", "done"]);

export function PageTasksCard({ page }: { page: MarketingPage }) {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectTasksForEntity("web_page", page.id));
  const loading = useAppSelector(
    selectTasksForEntityLoading("web_page", page.id),
  );
  useEffect(() => {
    void dispatch(
      fetchTasksForEntity({ entityType: "web_page", entityId: page.id }),
    );
  }, [dispatch, page.id]);

  const open = tasks.filter((task) => !STATUS_DONE.has(task.status));
  const done = tasks.filter((task) => STATUS_DONE.has(task.status));

  const copy = webCopy({
    kind: "web-page-tasks",
    label: "Page tasks",
    description: "Every task associated with this canonical page.",
    surface: `Page tasks — ${page.url}`,
    data: { url: page.url, tasks },
    lines: [
      ["URL", page.url],
      ["Open tasks", open.length],
      ["Completed tasks", done.length],
      ...tasks.map((task): [string, string] => [
        task.status,
        task.title,
      ]),
    ],
    attributes: { page_id: page.id, count: tasks.length },
  });

  return (
    <SectionCard
      title="Page tasks"
      copy={copy}
      collapsible
      anchor="page_tasks"
      headerExtra={
        <QuickCreateTaskButton
          variant="icon"
          source={{
            entity_type: "web_page",
            entity_id: page.id,
            label: page.path || page.url,
          }}
        />
      }
    >
      <div className="grid gap-1.5 p-3">
        {loading && tasks.length === 0 ? (
          <div className="h-16 animate-pulse rounded-lg border border-border bg-muted/40" />
        ) : tasks.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <ListTodo className="h-4 w-4" />
            No tasks yet — use the + to create one, or the task buttons on any
            card to turn a finding into work.
          </p>
        ) : (
          [...open, ...done].map((task) => {
            const completed = STATUS_DONE.has(task.status);
            return (
              <Link
                key={task.task_id}
                href={`/tasks/${task.task_id}`}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs transition-colors hover:border-border hover:bg-muted/40",
                  completed && "opacity-60",
                )}
              >
                <ListTodo
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    completed ? "text-success" : "text-primary",
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-foreground",
                    completed && "line-through",
                  )}
                >
                  {task.title}
                </span>
                {task.priority ? (
                  <Badge
                    variant={task.priority === "high" ? "warning" : "outline"}
                    className="shrink-0 text-[9px] uppercase"
                  >
                    {task.priority}
                  </Badge>
                ) : null}
                {task.due_date ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <CalendarClock className="h-3 w-3" />
                    {formatDate(task.due_date)}
                  </span>
                ) : null}
                <Badge variant="outline" className="shrink-0 text-[9px]">
                  {task.status}
                </Badge>
              </Link>
            );
          })
        )}
      </div>
    </SectionCard>
  );
}
