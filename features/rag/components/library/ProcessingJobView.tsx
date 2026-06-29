"use client";

/**
 * ProcessingJobView — single-job rich processing visualization.
 *
 * Used in two surfaces (with the same look in both):
 *   1. <ProcessingProgressSheet/>   — standalone right-side sheet for any
 *      job (e.g. upload-from-header flow).
 *   2. Inline inside <LibraryDocDetailSheet/>'s Stages tab — when the user
 *      triggers a stage from the detail sheet they're already in, the live
 *      job renders right there instead of opening a second sheet that
 *      visually jumps to a different size.
 *
 * Layout (uses the full available width — no centered tiny card):
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Stepper (4 stages, full width)                           │
 *   ├──────────────────────────────┬───────────────────────────┤
 *   │ Stage hero animation         │ Live output stream        │
 *   │ (unique animated visual)     │ (large, scrolling text    │
 *   │                              │  preview + char counter)  │
 *   ├──────────────────────────────┴───────────────────────────┤
 *   │ Metrics rail (elapsed · rate · ETA)                      │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Persisted stage outputs (collapsible accordion)          │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Actions (cancel / dismiss / open-in-library)             │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Result / error states replace the hero+live panel with a success or error
 * card while keeping the stepper, metrics, and persisted stages visible.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Trash2,
  X as XIcon,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  ProcessingFrame,
  ProcessingStageId,
  StagePreview,
} from "./ProcessingProgressDialog";
import type { ProcessingJob } from "@/features/rag/hooks/useProcessingRunner";
import { STAGE_META, StageHero } from "./StageAnimations";

const STAGES: ProcessingStageId[] = ["extract", "clean", "chunk", "embed"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ProcessingJobViewProps {
  job: ProcessingJob;
  /** Compact mode — hides the metrics rail's secondary stats; used when
   *  vertical space is tight (multi-job stack in the standalone sheet). */
  compact?: boolean;
  /** Show actions footer (cancel / dismiss). Default true. */
  showActions?: boolean;
  onCancel?: () => void;
  onDismiss?: () => void;
}

export function ProcessingJobView({
  job,
  compact = false,
  showActions = true,
  onCancel,
  onDismiss,
}: ProcessingJobViewProps) {
  const stageStates = useMemo(() => deriveStageStates(job), [job]);
  const isRunning = job.status === "running";
  const isFailed = job.status === "failed";
  const isDone = job.status === "succeeded";

  return (
    <div className="space-y-4">
      <Stepper stageStates={stageStates} activeStage={job.frame?.activeStage} />

      {isRunning && job.frame && (
        <div
          className={cn(
            "grid gap-3",
            compact
              ? "grid-cols-1"
              : "grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]",
          )}
        >
          <StageHero frame={job.frame} className="min-h-[260px]" />
          <LiveOutputPanel job={job} />
        </div>
      )}

      {isFailed && <ErrorPanel error={job.error ?? "Processing failed."} />}
      {isDone && job.result && (
        <ResultPanel result={job.result} byStage={job.byStage} />
      )}

      <MetricsRail job={job} compact={compact} />

      <PersistedStagesColumn job={job} />

      {showActions && (
        <JobActions job={job} onCancel={onCancel} onDismiss={onDismiss} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper — 4 stage cells with active "ring"
// ---------------------------------------------------------------------------

function Stepper({
  stageStates,
  activeStage,
}: {
  stageStates: Record<
    ProcessingStageId,
    "pending" | "running" | "done" | "error"
  >;
  activeStage?: ProcessingStageId | null;
}) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STAGES.map((id) => {
        const state = stageStates[id];
        const meta = STAGE_META[id];
        const isActive = state === "running";
        return (
          <li
            key={id}
            className={cn(
              "relative rounded-lg border px-2 py-2 transition-colors",
              state === "done" &&
                "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
              state === "running" &&
                "border-primary/50 bg-primary/5 text-primary",
              state === "error" &&
                "border-destructive/50 bg-destructive/5 text-destructive",
              state === "pending" &&
                "border-border bg-muted/30 text-muted-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`stepper-active-${activeStage}`}
                className="absolute inset-0 rounded-lg ring-2 ring-primary/40"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <div className="relative flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-background/80 shrink-0">
                {state === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : state === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : state === "error" ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <meta.Icon className="h-3 w-3" />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide leading-tight">
                  {meta.label}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// LiveOutputPanel — large scrolling preview of whatever the active stage
// just produced. Replaces the tiny "Latest output" footer with a real
// content panel sized for reading.
// ---------------------------------------------------------------------------

function LiveOutputPanel({ job }: { job: ProcessingJob }) {
  const frame = job.frame;
  const preview = frame?.latestPreview ?? null;
  const stage = frame?.activeStage ?? "extract";
  const meta = STAGE_META[stage];
  const message = frame?.message ?? "Working…";

  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-h-[260px]">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="relative inline-flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Live output · {meta.label}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={message}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.2 }}
              className="text-xs text-foreground/80 truncate"
            >
              {message}
            </motion.div>
          </AnimatePresence>
        </div>
        {preview && <PreviewMetaBadges preview={preview} />}
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        {preview ? (
          <div className="absolute inset-0 overflow-y-auto p-3">
            <LivePreviewBody preview={preview} />
          </div>
        ) : (
          <WaitingState stage={stage} />
        )}
      </div>

      {/* Animated progress bar, glued to the bottom */}
      <ProgressTicker frame={frame} />
    </div>
  );
}

function PreviewMetaBadges({ preview }: { preview: StagePreview }) {
  if (preview.kind === "page_text") {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
        page {preview.page_number}
      </Badge>
    );
  }
  if (preview.kind === "page_clean") {
    return (
      <div className="flex items-center gap-1 shrink-0">
        {preview.section_kind && (
          <Badge variant="info" className="text-[10px] px-1.5 py-0 h-4">
            {preview.section_kind}
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
          page {preview.page_number}
        </Badge>
      </div>
    );
  }
  if (preview.kind === "chunks_sample") {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
        {preview.samples.length} samples
      </Badge>
    );
  }
  return null;
}

function LivePreviewBody({ preview }: { preview: StagePreview }) {
  if (preview.kind === "page_text") {
    return (
      <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground/90">
        {preview.text || (
          <span className="italic text-muted-foreground">(empty page)</span>
        )}
      </pre>
    );
  }
  if (preview.kind === "page_clean") {
    return (
      <div className="space-y-3">
        {preview.section_title && (
          <div className="text-sm font-semibold">{preview.section_title}</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
              Raw
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed bg-muted/40 rounded p-2 max-h-44 overflow-auto">
              {preview.raw_text || (
                <span className="italic text-muted-foreground">(empty)</span>
              )}
            </pre>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">
              Cleaned
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed bg-emerald-500/5 border border-emerald-500/15 rounded p-2 max-h-44 overflow-auto">
              {preview.cleaned_text || (
                <span className="italic text-muted-foreground">(empty)</span>
              )}
            </pre>
          </div>
        </div>
      </div>
    );
  }
  if (preview.kind === "chunks_sample") {
    return (
      <div className="space-y-2">
        {preview.samples.slice(0, 4).map((c, i) => (
          <div
            key={c.chunk_index ?? i}
            className="rounded-md border bg-muted/30 p-2 space-y-1"
          >
            <div className="flex items-center gap-1 text-[10px] flex-wrap">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                #{c.chunk_index ?? i + 1}
              </Badge>
              {c.chunk_kind && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  {c.chunk_kind}
                </Badge>
              )}
              {c.token_count != null && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  {c.token_count.toLocaleString()} tok
                </Badge>
              )}
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed line-clamp-4">
              {c.content_text}
            </pre>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function WaitingState({ stage }: { stage: ProcessingStageId }) {
  const meta = STAGE_META[stage];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-sm",
          meta.chipBg,
          meta.chipBorder,
        )}
      >
        <meta.Icon className={cn("h-4 w-4", meta.iconClass)} />
      </div>
      <div className="text-xs text-muted-foreground max-w-xs">
        Waiting for the first {meta.unit.toLowerCase()} from the server. The
        animation on the left runs at the real pace as updates stream in.
      </div>
    </div>
  );
}

function ProgressTicker({ frame }: { frame: ProcessingFrame | null }) {
  if (!frame) {
    return (
      <div className="h-1.5 w-full bg-muted overflow-hidden">
        <motion.div
          className="h-full w-1/3 bg-primary/60"
          initial={{ x: "-100%" }}
          animate={{ x: "300%" }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>
    );
  }
  const pct =
    frame.fraction != null
      ? Math.min(100, Math.round(frame.fraction * 100))
      : null;
  return (
    <div className="h-1.5 w-full bg-muted relative overflow-hidden">
      {pct == null ? (
        <motion.div
          className="absolute inset-y-0 w-1/3 bg-primary/60"
          initial={{ x: "-100%" }}
          animate={{ x: "300%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
        />
      ) : (
        <>
          <motion.div
            className="absolute inset-y-0 left-0 bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
          <motion.div
            className="absolute inset-y-0 w-12 bg-white/30 dark:bg-white/15"
            initial={{ x: "-100%" }}
            animate={{ x: `${Math.max(pct - 10, 0)}%` }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{ filter: "blur(6px)" }}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricsRail — elapsed, rate, ETA, items processed (live)
// ---------------------------------------------------------------------------

function MetricsRail({
  job,
  compact,
}: {
  job: ProcessingJob;
  compact?: boolean;
}) {
  // Re-render every second so elapsed / ETA stay current.
  const [, force] = useState(0);
  useEffect(() => {
    if (job.status !== "running") return undefined;
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [job.status]);

  const elapsedMs = (job.endedAt ?? Date.now()) - job.startedAt;
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const elapsedLabel = formatDuration(elapsedSec);

  // Throughput: items per second based on current frame.
  const current = job.frame?.current ?? 0;
  const total = job.frame?.total ?? 0;
  const ratePerSec = elapsedSec > 0 ? current / elapsedSec : 0;
  const remaining = Math.max(0, total - current);
  const etaSec = ratePerSec > 0 && remaining > 0 ? remaining / ratePerSec : 0;
  const etaLabel = etaSec > 0 ? formatDuration(Math.round(etaSec)) : "—";
  const stage = job.frame?.activeStage;
  const unit = stage ? STAGE_META[stage].unit.toLowerCase() : "item";

  const items: Array<{
    label: string;
    value: string;
    sub?: string;
    accent?: boolean;
  }> = [
    {
      label: "Elapsed",
      value: elapsedLabel,
      sub: job.status === "running" ? "running" : statusLabel(job.status),
      accent: job.status === "running",
    },
  ];
  if (!compact || job.status === "running") {
    items.push({
      label: `${unit}/s`,
      value: ratePerSec > 0 ? formatRate(ratePerSec) : "—",
      sub: `${current.toLocaleString()} done`,
    });
    items.push({
      label: "ETA",
      value: etaLabel,
      sub: total > 0 ? `${remaining.toLocaleString()} ${unit} left` : "—",
    });
  }
  if (!compact && stage) {
    items.push({
      label: "Stage",
      value: STAGE_META[stage].label,
      sub: `${current.toLocaleString()} / ${total.toLocaleString()}`,
    });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((m) => (
        <div
          key={m.label}
          className={cn(
            "rounded-md border p-2 bg-card",
            m.accent && "border-primary/30 bg-primary/5",
          )}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {m.label}
          </div>
          <div className="text-sm font-semibold tabular-nums leading-tight">
            {m.value}
          </div>
          {m.sub && (
            <div className="text-[10px] text-muted-foreground truncate">
              {m.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Persisted stage outputs (collapsible accordion of finished stages)
// ---------------------------------------------------------------------------

function PersistedStagesColumn({ job }: { job: ProcessingJob }) {
  const persisted = STAGES.filter((id) => {
    const preview = job.stagePreviews[id];
    const summary = job.byStage[id];
    if (!preview && !summary) return false;
    if (job.frame?.activeStage === id && job.status === "running") return false;
    return true;
  });
  if (persisted.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
        Stage outputs
      </div>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {persisted.map((id) => {
            const meta = STAGE_META[id];
            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="rounded-lg border bg-card"
              >
                <details
                  className="group"
                  open={Boolean(job.stagePreviews[id])}
                >
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    </span>
                    <span className="font-semibold">{meta.label}</span>
                    {job.byStage[id] && (
                      <span className="text-muted-foreground truncate">
                        · {job.byStage[id]}
                      </span>
                    )}
                    <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180 shrink-0" />
                  </summary>
                  {job.stagePreviews[id] && (
                    <div className="border-t px-3 py-3">
                      <LivePreviewBody preview={job.stagePreviews[id]!} />
                    </div>
                  )}
                </details>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result / error panels — terminal states
// ---------------------------------------------------------------------------

function ResultPanel({
  result,
  byStage,
}: {
  result: NonNullable<ProcessingJob["result"]>;
  byStage: ProcessingJob["byStage"];
}) {
  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Done</div>
          {result.headline && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {result.headline}
            </p>
          )}
        </div>
        {result.processedDocumentId && (
          <a
            href={`/rag/library/${result.processedDocumentId}/preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 mt-3">
        {STAGES.map((id) => {
          const summary = byStage[id] ?? result.byStage[id];
          if (!summary) return null;
          const meta = STAGE_META[id];
          return (
            <div
              key={id}
              className="flex items-start gap-1.5 rounded-md border bg-background/60 p-2"
            >
              <meta.Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {meta.label}
                </div>
                <div className="text-xs">{summary}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorPanel({ error }: { error: string }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-destructive">
            Processing failed
          </div>
          <p className="text-xs break-words mt-0.5">{error}</p>
          <p className="text-[10px] text-muted-foreground mt-2">
            Re-run the stage from the document detail panel — it's idempotent
            and will replace partial output.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions footer
// ---------------------------------------------------------------------------

function JobActions({
  job,
  onCancel,
  onDismiss,
}: {
  job: ProcessingJob;
  onCancel?: () => void;
  onDismiss?: () => void;
}) {
  if (job.status === "running") {
    return (
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[10px] text-muted-foreground">
          Safe to close — processing continues on the server.
        </p>
        {onCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="h-7 text-xs"
          >
            <XIcon className="h-3 w-3 mr-1" />
            Stop
          </Button>
        )}
      </div>
    );
  }
  if (!onDismiss) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={onDismiss}
        className="h-7 text-xs"
      >
        <Trash2 className="h-3 w-3 mr-1" />
        Clear
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveStageStates(
  job: ProcessingJob,
): Record<ProcessingStageId, "pending" | "running" | "done" | "error"> {
  const out: Record<
    ProcessingStageId,
    "pending" | "running" | "done" | "error"
  > = {
    extract: "pending",
    clean: "pending",
    chunk: "pending",
    embed: "pending",
  };

  if (job.status === "succeeded") {
    for (const id of STAGES) {
      if (job.byStage[id] || job.stagePreviews[id]) out[id] = "done";
    }
    if (job.kind === "pipeline") {
      for (const id of STAGES) out[id] = "done";
    }
    return out;
  }

  for (const id of STAGES) {
    if (job.byStage[id] || job.stagePreviews[id]) out[id] = "done";
  }

  const active = job.frame?.activeStage;
  if (active) {
    if (job.status === "failed") {
      out[active] = "error";
    } else if (job.status === "running") {
      out[active] = "running";
      let seenActive = false;
      for (const id of STAGES) {
        if (id === active) {
          seenActive = true;
          continue;
        }
        if (!seenActive && out[id] === "pending") out[id] = "done";
      }
    }
  }
  if (job.status === "failed" && !active) {
    out.extract = "error";
  }
  return out;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

function formatRate(perSec: number): string {
  if (perSec >= 10) return `${perSec.toFixed(0)}`;
  if (perSec >= 1) return `${perSec.toFixed(1)}`;
  return `${perSec.toFixed(2)}`;
}

function statusLabel(status: ProcessingJob["status"]): string {
  switch (status) {
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "running":
      return "running";
  }
}
