"use client";

/**
 * ActiveJobsStrip — inline horizontal row of running processing jobs.
 *
 * Lives between the rollup KPI grid and the document table. Only renders
 * when at least one job is running OR there are recently-finished jobs
 * the user hasn't dismissed. Each chip is compact but premium:
 *   - file name (truncated)
 *   - current stage chip
 *   - mini animated progress bar with shimmer
 *   - percent + counts
 *   - click → opens the ProcessingProgressSheet focused on that job
 *
 * Doesn't touch or modify the document table layout.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Layers,
  Loader2,
  Stars,
  Zap,
  X as XIcon,
  XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ProcessingJob } from "@/features/rag/hooks/useProcessingRunner";
import type { ProcessingStageId } from "./ProcessingProgressDialog";

interface StageMeta {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Tailwind classes for the active-stage gradient stripe. */
  gradient: string;
  text: string;
}

const STAGE_META: Record<ProcessingStageId, StageMeta> = {
  extract: {
    label: "Extract",
    Icon: FileText,
    gradient: "from-sky-500 to-sky-400",
    text: "text-sky-700 dark:text-sky-300",
  },
  clean: {
    label: "Clean",
    Icon: Zap,
    gradient: "from-violet-500 to-violet-400",
    text: "text-violet-700 dark:text-violet-300",
  },
  chunk: {
    label: "Chunk",
    Icon: Layers,
    gradient: "from-amber-500 to-amber-400",
    text: "text-amber-700 dark:text-amber-300",
  },
  embed: {
    label: "Embed",
    Icon: Stars,
    gradient: "from-emerald-500 to-emerald-400",
    text: "text-emerald-700 dark:text-emerald-300",
  },
};

export interface ActiveJobsStripProps {
  jobs: ProcessingJob[];
  onOpen: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  /** Open the full sheet without focusing a specific job. */
  onOpenAll?: () => void;
}

export function ActiveJobsStrip({
  jobs,
  onOpen,
  onCancel,
  onDismiss,
  onOpenAll,
}: ActiveJobsStripProps) {
  // Show running first, then recently terminal (auto-clears after a delay
  // for completed; failed sticks around until dismissed).
  const visibleJobs = jobs.filter((j) => {
    if (j.status === "running" || j.status === "failed") return true;
    if (j.status === "succeeded" && j.endedAt) {
      // Linger 8s after success so the user sees the green flash, then auto-dismiss.
      return Date.now() - j.endedAt < 8000;
    }
    return false;
  });

  // Force a re-render when a recently-completed job needs to time out.
  const [, force] = useState(0);
  useEffect(() => {
    const hasLinger = visibleJobs.some(
      (j) => j.status === "succeeded" && j.endedAt,
    );
    if (!hasLinger) return;
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [visibleJobs]);

  return (
    <AnimatePresence initial={false}>
      {visibleJobs.length > 0 && (
        <motion.div
          key="active-strip"
          layout
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="rounded-xl border bg-gradient-to-br from-primary/[0.04] to-transparent p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="font-semibold tracking-tight">
                  Live processing
                </span>
                <span className="text-muted-foreground">
                  · {visibleJobs.filter((j) => j.status === "running").length}{" "}
                  running
                </span>
              </div>
              {onOpenAll && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onOpenAll}
                  className="h-6 text-xs gap-1"
                >
                  <Eye className="h-3 w-3" />
                  Watch all
                </Button>
              )}
            </div>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence initial={false}>
                {visibleJobs.map((job) => (
                  <motion.div
                    key={job.jobId}
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <JobChip
                      job={job}
                      onOpen={() => onOpen(job.jobId)}
                      onCancel={() => onCancel(job.jobId)}
                      onDismiss={() => onDismiss(job.jobId)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function JobChip({
  job,
  onOpen,
  onCancel,
  onDismiss,
}: {
  job: ProcessingJob;
  onOpen: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const isRunning = job.status === "running";
  const isFailed = job.status === "failed";
  const isDone = job.status === "succeeded";

  const stageId = job.frame?.activeStage ?? "extract";
  const stageMeta = STAGE_META[stageId];
  const Icon = stageMeta.Icon;

  const pct =
    job.frame?.fraction != null
      ? Math.min(100, Math.round(job.frame.fraction * 100))
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative w-full rounded-lg border bg-card text-left p-2.5",
        "hover:bg-accent/40 transition-colors overflow-hidden",
        isFailed && "border-destructive/40",
        isDone && "border-emerald-500/40 bg-emerald-500/[0.04]",
      )}
    >
      {/* Animated rail at the bottom showing progress */}
      {isRunning && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-muted"
          aria-hidden
        >
          {pct == null ? (
            <motion.div
              className={cn(
                "absolute inset-y-0 w-1/3 bg-gradient-to-r",
                stageMeta.gradient,
              )}
              initial={{ x: "-100%" }}
              animate={{ x: "300%" }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ) : (
            <motion.div
              className={cn("h-full bg-gradient-to-r", stageMeta.gradient)}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          )}
        </div>
      )}

      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            isRunning && "bg-primary/10",
            isDone && "bg-emerald-500/15",
            isFailed && "bg-destructive/10",
          )}
        >
          {isRunning ? (
            <>
              <Icon className={cn("h-3.5 w-3.5", stageMeta.text)} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-background border">
                <Loader2 className="h-2 w-2 animate-spin text-primary" />
              </span>
            </>
          ) : isDone ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold truncate">{job.title}</span>
            {isRunning && (
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide shrink-0",
                  stageMeta.text,
                )}
              >
                {stageMeta.label}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {isRunning
              ? (job.frame?.message ?? "Working…")
              : isDone
                ? (job.result?.headline ?? "Indexed successfully.")
                : (job.error ?? "Failed")}
          </div>
          {isRunning && (
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span className="truncate">
                {(job.frame?.current ?? 0).toLocaleString()}
                {(job.frame?.total ?? 0) > 0
                  ? ` / ${job.frame!.total.toLocaleString()}`
                  : ""}
              </span>
              <span>{pct != null ? `${pct}%` : "starting…"}</span>
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-start gap-0.5">
          {isRunning ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onCancel();
                }
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Stop"
            >
              <XIcon className="h-3 w-3" />
            </span>
          ) : (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onDismiss();
                }
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Dismiss"
            >
              <XIcon className="h-3 w-3" />
            </span>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}
