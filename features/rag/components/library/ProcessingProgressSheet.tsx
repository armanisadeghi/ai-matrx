"use client";

/**
 * ProcessingProgressSheet — premium right-side panel showing live progress
 * for any number of processing jobs (single stage runs OR full pipelines).
 *
 * Width is locked to `min(100vw, 900px)` so it visually aligns with
 * `LibraryDocDetailSheet` — switching between the two never makes the panel
 * jump to a different width / layout.
 *
 * Behavior:
 *   - One job → renders the full <ProcessingJobView/> inline (no header strip).
 *   - Multi-job → vertical stack of cards. Each card has a header strip
 *     (always visible) and expands to the full <ProcessingJobView/> when
 *     focused. Defaults to expanding the focused / first-running job.
 *
 * Persisted stage previews and "stop / clear all" controls live here. The
 * actual rendering of a single job is delegated to <ProcessingJobView/> so
 * the inline view inside <LibraryDocDetailSheet/> looks identical.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Zap,
  Trash2,
  X as XIcon,
  XCircle,
} from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProcessingJob } from "@/features/rag/hooks/useProcessingRunner";
import { ProcessingJobView } from "./ProcessingJobView";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ProcessingProgressSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  jobs: ProcessingJob[];
  /** Job to scroll to / auto-expand when the sheet opens. */
  focusJobId?: string | null;

  onCancel: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  onCancelAll?: () => void;
  onDismissAll?: () => void;
}

export function ProcessingProgressSheet({
  open,
  onOpenChange,
  jobs,
  focusJobId,
  onCancel,
  onDismiss,
  onCancelAll,
  onDismissAll,
}: ProcessingProgressSheetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Default expansion: focused job, otherwise the first running, otherwise
  // the top of the list. Recomputes when the sheet (re)opens.
  useEffect(() => {
    if (!open) return;
    if (focusJobId && jobs.some((j) => j.jobId === focusJobId)) {
      setExpandedId(focusJobId);
      return;
    }
    const firstRunning = jobs.find((j) => j.status === "running");
    setExpandedId(firstRunning?.jobId ?? jobs[0]?.jobId ?? null);
  }, [open, focusJobId, jobs]);

  // Scroll the focused card into view when the sheet opens.
  useEffect(() => {
    if (!open || !expandedId) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-job-id="${expandedId}"]`,
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open, expandedId]);

  const runningCount = jobs.filter((j) => j.status === "running").length;
  const terminalCount = jobs.length - runningCount;
  const singleJob = jobs.length === 1 ? jobs[0] : null;

  const sheetTitle = (
    <span className="flex items-center gap-2">
      <span className="relative inline-flex h-2 w-2">
        {runningCount > 0 ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </>
        ) : (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        )}
      </span>
      {singleJob ? singleJob.title : "Processing"}
    </span>
  );

  const sheetDescription = singleJob
    ? (singleJob.subtitle ??
      (singleJob.status === "running"
        ? (singleJob.frame?.message ?? "Working…")
        : statusLabel(singleJob.status)))
    : jobs.length === 0
      ? "No active jobs."
      : runningCount > 0
        ? `${runningCount} running · ${terminalCount} finished`
        : `${jobs.length} finished`;

  const headerActions =
    jobs.length > 1 ? (
      <div className="flex items-center gap-1.5 shrink-0">
        {runningCount > 0 && onCancelAll && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancelAll}
            className="h-7 text-xs"
          >
            <XIcon className="h-3 w-3 mr-1" />
            Stop all
          </Button>
        )}
        {terminalCount > 0 && onDismissAll && (
          <Button
            size="sm"
            variant="outline"
            onClick={onDismissAll}
            className="h-7 text-xs"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear finished
          </Button>
        )}
      </div>
    ) : null;

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={sheetTitle}
      description={sheetDescription}
      headerActions={headerActions}
      position="right"
      defaultSize={50}
      maxSize={92}
      contentClassName="flex min-h-0 flex-1 flex-col p-0"
    >
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto">
        {jobs.length === 0 ? (
          <EmptyState />
        ) : singleJob ? (
          <div className="p-5">
            <ProcessingJobView
              job={singleJob}
              onCancel={() => onCancel(singleJob.jobId)}
              onDismiss={() => onDismiss(singleJob.jobId)}
            />
          </div>
        ) : (
          <ol className="p-4 space-y-4">
            <AnimatePresence initial={false}>
              {jobs.map((job) => (
                <motion.li
                  key={job.jobId}
                  data-job-id={job.jobId}
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <JobCard
                    job={job}
                    expanded={expandedId === job.jobId}
                    onToggle={() =>
                      setExpandedId((id) =>
                        id === job.jobId ? null : job.jobId,
                      )
                    }
                    onCancel={() => onCancel(job.jobId)}
                    onDismiss={() => onDismiss(job.jobId)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </MatrxDynamicPanelHost>
  );
}

// ---------------------------------------------------------------------------
// One job card — compact strip + expanded full <ProcessingJobView/>
// ---------------------------------------------------------------------------

function JobCard({
  job,
  expanded,
  onToggle,
  onCancel,
  onDismiss,
}: {
  job: ProcessingJob;
  expanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const isRunning = job.status === "running";
  const isFailed = job.status === "failed";
  const isDone = job.status === "succeeded";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden transition-shadow",
        isRunning && "shadow-[0_0_0_1px] shadow-primary/20",
        isDone && "shadow-[0_0_0_1px] shadow-emerald-500/15",
        isFailed && "shadow-[0_0_0_1px] shadow-destructive/20",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left",
          "hover:bg-accent/40 transition-colors",
        )}
      >
        <StatusOrb job={job} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{job.title}</h3>
            <JobStatusBadge job={job} />
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {isRunning
              ? (job.frame?.message ?? "Working…")
              : isFailed
                ? (job.error ?? "Failed")
                : (job.result?.headline ?? job.subtitle ?? "Done")}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isRunning ? (
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                expanded && "rotate-90",
              )}
            />
          ) : (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          )}
        </div>
      </button>

      {/* Mini progress strip visible even when collapsed (running jobs) */}
      {isRunning && !expanded && <MiniProgress job={job} />}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-4 border-t">
              <ProcessingJobView
                job={job}
                compact
                onCancel={onCancel}
                onDismiss={onDismiss}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MiniProgress({ job }: { job: ProcessingJob }) {
  const fraction = job.frame?.fraction;
  const pct =
    fraction != null ? Math.min(100, Math.round(fraction * 100)) : null;
  return (
    <div className="px-4 pb-2 space-y-1">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {pct == null ? (
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full bg-primary/40"
            initial={{ x: "-100%" }}
            animate={{ x: "300%" }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ) : (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
        <span className="truncate">
          {(job.frame?.current ?? 0).toLocaleString()}
          {(job.frame?.total ?? 0) > 0
            ? ` / ${job.frame!.total.toLocaleString()}`
            : ""}
        </span>
        <span>{pct != null ? `${pct}%` : "starting…"}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status visuals
// ---------------------------------------------------------------------------

function StatusOrb({ job }: { job: ProcessingJob }) {
  if (job.status === "running") {
    return (
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="absolute inset-0 rounded-full ring-2 ring-primary/30 animate-pulse" />
      </div>
    );
  }
  if (job.status === "succeeded") {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
      </div>
    );
  }
  if (job.status === "failed") {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
        <XCircle className="h-5 w-5 text-destructive" />
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
      <XIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function JobStatusBadge({ job }: { job: ProcessingJob }) {
  if (job.status === "running") {
    return (
      <Badge variant="info" className="text-[10px] px-1.5 py-0 h-4">
        running
      </Badge>
    );
  }
  if (job.status === "succeeded") {
    return (
      <Badge variant="success" className="text-[10px] px-1.5 py-0 h-4">
        done
      </Badge>
    );
  }
  if (job.status === "failed") {
    return (
      <Badge variant="error" className="text-[10px] px-1.5 py-0 h-4">
        failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
      cancelled
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Zap className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold">Nothing processing yet</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Upload a file or re-run a stage to watch live extraction, cleaning,
        segmentation, and embedding stream in here.
      </p>
    </div>
  );
}

function statusLabel(status: ProcessingJob["status"]): string {
  switch (status) {
    case "succeeded":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "running":
      return "Running";
  }
}
