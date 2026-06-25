"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  CheckSquare,
  FolderKanban,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import type { EnvelopeRendererProps } from "@/features/matrx-envelope/registry";

import { parseCreateProjectWithTasksItems } from "./parseDirectiveItems";
import { useResolveCreatedProject } from "./useResolveCreatedProject";
import type {
  CreateProjectTaskItem,
  CreateProjectWithTasksItem,
  ResolvedCreatedProject,
  ResolvedProjectTask,
} from "./types";

const Shimmer: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={cn(
      "inline-block animate-pulse rounded bg-zinc-300/70 dark:bg-zinc-700/70 align-middle",
      className,
    )}
  />
);

function projectHref(project: ResolvedCreatedProject): string {
  const segment = project.slug ?? project.id;
  if (project.organizationId && project.orgSlug) {
    return `/organizations/${project.orgSlug}/projects/${segment}`;
  }
  return `/projects/${project.id}`;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function OptimisticTaskRow({
  task,
  index,
}: {
  task: CreateProjectTaskItem;
  index: number;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-dashed border-border/60",
        "bg-muted/30 px-3 py-2 text-sm",
      )}
    >
      <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground/90">{task.name}</p>
        {task.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        ) : null}
        {task.subtasks && task.subtasks.length > 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {task.subtasks.length} subtask
            {task.subtasks.length === 1 ? "" : "s"} queued
          </p>
        ) : null}
      </div>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        #{index + 1}
      </span>
    </div>
  );
}

function ResolvedTaskRow({
  task,
  onOpen,
}: {
  task: ResolvedProjectTask;
  onOpen: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-lg border border-border/70",
        "bg-card px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
      )}
    >
      <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {task.title}
        </p>
        {task.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        ) : null}
        {task.status ? (
          <span className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {task.status.replace(/_/g, " ")}
          </span>
        ) : null}
      </div>
      <ArrowUpRight
        className={cn(
          "h-4 w-4 shrink-0 self-center text-muted-foreground transition-opacity",
          hovered ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

function ProjectDirectiveCard({
  item,
  resolved,
  status,
}: {
  item: CreateProjectWithTasksItem;
  resolved: ResolvedCreatedProject | null;
  status: "polling" | "resolved" | "exhausted";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hovered, setHovered] = useState(false);
  const openItem = useOpenItemPresentation();
  const openTaskEditor = useOpenTaskEditorWindow();

  const isResolved = status === "resolved" && !!resolved;
  const isPolling = status === "polling";
  const isExhausted = status === "exhausted";

  const name = resolved?.name ?? item.name;
  const description = resolved?.description ?? item.description;
  const startDate = formatDate(resolved?.startDate ?? item.start_date);
  const endDate = formatDate(resolved?.targetDate ?? item.end_date);
  const optimisticTasks = item.tasks ?? [];
  const resolvedTasks = resolved?.tasks ?? [];
  const taskCount = isResolved ? resolvedTasks.length : optimisticTasks.length;

  const href = resolved ? projectHref(resolved) : null;
  const canOpenProject = isResolved && !!resolved;

  const handleProjectClick = (e?: React.MouseEvent) => {
    if (!canOpenProject || !resolved) return;
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    openItem("project", resolved.id, {
      name: resolved.name,
      about: resolved.description,
    });
  };

  const handleProjectNavigate = (e?: React.MouseEvent) => {
    if (!href) return;
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    startTransition(() => router.push(href));
  };

  const cardInner = (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="my-3 w-full max-w-xl"
    >
      <div
        role={canOpenProject ? "button" : undefined}
        tabIndex={canOpenProject ? 0 : undefined}
        onClick={canOpenProject ? handleProjectClick : undefined}
        onKeyDown={
          canOpenProject
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleProjectClick();
                }
              }
            : undefined
        }
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "group relative overflow-hidden rounded-xl border bg-card text-left",
          "border-border/70 ring-1 ring-inset ring-blue-500/20",
          canOpenProject &&
            "cursor-pointer hover:-translate-y-0.5 hover:border-border hover:shadow-md transition-all duration-200",
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-28 opacity-60",
            "bg-blue-500/10 [mask-image:linear-gradient(to_right,black,transparent)]",
          )}
        />

        <div className="relative border-b border-border/50 p-3.5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-inset ring-blue-500/20">
              {isPolling && !isResolved ? (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
              ) : (
                <FolderKanban className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-base font-semibold text-foreground">
                  {name}
                </span>
                <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 ring-1 ring-inset ring-blue-500/20 dark:text-blue-300">
                  Project
                </span>
                {isPolling && !isResolved ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Creating…
                  </span>
                ) : null}
                {isResolved ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    Ready
                  </span>
                ) : null}
              </div>

              {description ? (
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : isPolling ? (
                <Shimmer className="mt-2 h-3 w-56" />
              ) : null}

              <div className="mt-2 flex flex-wrap gap-2">
                {(item.slug || resolved?.slug) && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    /{resolved?.slug ?? item.slug}
                  </span>
                )}
                {startDate ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {startDate}
                    {endDate ? ` → ${endDate}` : ""}
                  </span>
                ) : null}
              </div>
            </div>

            {canOpenProject && (
              <div
                className={cn(
                  "shrink-0 self-center rounded-md p-1.5 text-muted-foreground transition-all",
                  hovered && "bg-muted text-foreground",
                )}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
              </div>
            )}
          </div>

          {isExhausted && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                The project is still being created. Please refresh the browser
                to see the live project and tasks.
              </span>
            </div>
          )}
        </div>

        {taskCount > 0 && (
          <div className="space-y-2 p-3.5 pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tasks
              </p>
              <span className="text-[11px] text-muted-foreground">
                {taskCount} {taskCount === 1 ? "item" : "items"}
              </span>
            </div>

            <AnimatePresence initial={false} mode="popLayout">
              {isResolved
                ? resolvedTasks.map((task) => (
                    <ResolvedTaskRow
                      key={task.id}
                      task={task}
                      onOpen={() => openTaskEditor({ taskId: task.id })}
                    />
                  ))
                : optimisticTasks.map((task, index) => (
                    <OptimisticTaskRow
                      key={`${task.name}-${index}`}
                      task={task}
                      index={index}
                    />
                  ))}
            </AnimatePresence>
          </div>
        )}

        {canOpenProject && href && (
          <div className="border-t border-border/50 px-3.5 py-2.5">
            <Link
              href={href}
              onClick={(e) => {
                e.stopPropagation();
                handleProjectNavigate(e);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open project workspace
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  );

  return cardInner;
}

const CreateProjectWithTasksRenderer: React.FC<EnvelopeRendererProps> = ({
  envelope,
}) => {
  const items = parseCreateProjectWithTasksItems(envelope);

  if (items.length === 0) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Project directive — waiting for project details…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <ProjectDirectiveCardContainer
          key={`${item.slug ?? item.name}-${index}`}
          item={item}
        />
      ))}
    </div>
  );
};

function ProjectDirectiveCardContainer({
  item,
}: {
  item: CreateProjectWithTasksItem;
}) {
  const { status, data } = useResolveCreatedProject(item);

  const displayStatus = status === "idle" ? "polling" : status;

  return (
    <ProjectDirectiveCard item={item} resolved={data} status={displayStatus} />
  );
}

export default CreateProjectWithTasksRenderer;
