/**
 * features/rag/components/FileRagStatusChip.tsx
 *
 * Compact RAG-lifecycle chip for a file, with optional inline actions.
 * Visual language matches RagStatusCell (Lightbulb / Loader2, muted dots).
 *
 *   none / not_scheduled → muted "Not processed"
 *   scheduled            → Clock + "Scheduled · {time}"
 *   running              → spinner + "Processing…"
 *   completed            → Lightbulb + "Indexed"
 *   failed               → destructive "Failed" (error in title)
 *   cancelled            → muted "Canceled"
 *
 * `showActions` adds "Process now" (when not running/completed) and
 * "Refresh" (when completed). Self-contained: it owns its own status query,
 * so it polls only while mounted (e.g. while a dialog is open).
 */

"use client";

import { Clock, Lightbulb, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useFileRagActions,
  useFileRagStatus,
} from "@/features/rag/hooks/useFileRagStatus";
import type { FileRagState } from "@/features/rag/api/rag-jobs";

export interface FileRagStatusChipProps {
  fileId: string | null;
  showActions?: boolean;
  className?: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const PILL =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium";

function StateChip({
  state,
  scheduledFor,
  errorMessage,
}: {
  state: FileRagState;
  scheduledFor: string | null;
  errorMessage?: string | null;
}) {
  switch (state) {
    case "scheduled": {
      const t = formatTime(scheduledFor);
      return (
        <span
          className={cn(PILL, "bg-amber-500/10 text-amber-600 dark:text-amber-400")}
          title={scheduledFor ? `Auto-processing scheduled for ${scheduledFor}` : undefined}
        >
          <Clock className="h-3 w-3" aria-hidden="true" />
          {t ? `Scheduled · ${t}` : "Scheduled"}
        </span>
      );
    }
    case "running":
      return (
        <span className={cn(PILL, "bg-muted text-muted-foreground")}>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Processing…
        </span>
      );
    case "completed":
      return (
        <span className={cn(PILL, "bg-primary/10 text-primary")}>
          <Lightbulb className="h-3 w-3" aria-hidden="true" />
          Indexed
        </span>
      );
    case "failed":
      return (
        <span
          className={cn(PILL, "bg-destructive/10 text-destructive")}
          title={errorMessage ?? "RAG processing failed"}
        >
          Failed
        </span>
      );
    case "cancelled":
      return (
        <span className={cn(PILL, "text-muted-foreground")}>Canceled</span>
      );
    default:
      return (
        <span className={cn(PILL, "text-muted-foreground/70")}>
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
          Not processed
        </span>
      );
  }
}

const ACTION_BTN =
  "h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground hover:bg-muted disabled:opacity-50";

export function FileRagStatusChip({
  fileId,
  showActions = false,
  className,
}: FileRagStatusChipProps) {
  const { status, isLoading } = useFileRagStatus(fileId);
  const actions = useFileRagActions(fileId);

  if (isLoading && !status) {
    return (
      <span className={cn(PILL, "text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Checking…
      </span>
    );
  }

  const state: FileRagState = status?.state ?? "not_scheduled";
  const canProcess = state !== "running" && state !== "completed";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <StateChip
        state={state}
        scheduledFor={status?.scheduled_for ?? null}
        errorMessage={status?.error?.message}
      />
      {showActions && fileId ? (
        <>
          {canProcess ? (
            <button
              type="button"
              className={ACTION_BTN}
              disabled={actions.processNowPending}
              onClick={actions.processNow}
            >
              {actions.processNowPending ? "Starting…" : "Process now"}
            </button>
          ) : null}
          {state === "completed" ? (
            <button
              type="button"
              className={ACTION_BTN}
              disabled={actions.refreshPending}
              onClick={actions.refresh}
            >
              {actions.refreshPending ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
