"use client";

/**
 * usePdfDocRun — the open document's server run, reconnected.
 *
 * A refresh, a closed laptop or a second tab never stops a PDF upload or AI
 * clean on the server. This hook asks the run record what is going on for the
 * open document (`useServerJob`, @ai-matrx/agents/react): the run THIS tab
 * started (its `X-Request-ID`, kept in sessionStorage) or else the document's
 * linked run (`processed_document`). A live run is rejoined — its progress and
 * text replay and continue here — and when it settles the saved document is
 * reloaded. The status shown is the run record's, never a guess.
 *
 * It stands down while this tab's own stream is running (that stream owns the
 * screen) and looks again the moment it ends.
 */

import { useState } from "react";
import { useServerJob } from "@ai-matrx/agents/react";
import type { MatrxStreamEnvelope, ServerJobStatus, ServerJobTarget } from "@ai-matrx/agents/matrx";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { useAppStore } from "@/lib/redux/hooks";
import {
  clearPdfRunRequest,
  readPdfRunRequest,
} from "../state/runRequests";

export type PdfDocRunPhase = "checking" | "running" | "failed" | "done" | "cancelled" | "idle";

export interface PdfDocRun {
  /** What the run record says, mapped for the screen. */
  phase: PdfDocRunPhase;
  /** The server's raw status (null until it answered). */
  status: ServerJobStatus | null;
  /** Short status line: the run's own latest progress text, else the phase label. */
  label: string | null;
  /** Clean text streamed by the rejoined run, while it runs. */
  streamingText: string | null;
  /** The run's error message, when it failed. */
  errorMessage: string | null;
  /** The lookup has answered (or could not reach the server) — safe to decide on auto-runs. */
  answered: boolean;
  /** Look the document's run up again now. */
  recheck: () => void;
}

export const PDF_RUN_LABEL = {
  running: "Cleaning…",
  failed: "Failed",
  done: "Done",
  cancelled: "Stopped",
} as const;

/** Map one frame of a rejoined PDF stream onto the status line / live text. */
export function readPdfRunFrame(
  envelope: MatrxStreamEnvelope,
  docId: string,
): { label?: string; text?: string; appendText?: string } | null {
  const data = (envelope.data ?? null) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return null;
  switch (envelope.event) {
    case "chunk":
      return typeof data.text === "string" && data.text ? { appendText: data.text } : null;
    case "info": {
      const msg = data.user_message ?? data.system_message ?? data.message;
      return typeof msg === "string" && msg ? { label: msg } : null;
    }
    case "reasoning":
      return data.state === "started" ? { label: "Reasoning…" } : null;
    case "data": {
      if (typeof data.clean_content === "string" && data.clean_content) {
        return { text: data.clean_content };
      }
      if (data.type === "pdf_page_extracted") {
        return { label: `Extracted page ${String(data.page_number)} of ${String(data.total_pages)}…` };
      }
      if (data.type === "pdf_clean_started") return { label: PDF_RUN_LABEL.running };
      if (data.kind === "content.processing.progress") {
        const forDoc = data.processed_document_id;
        if (forDoc && forDoc !== docId) return null;
        const stage = typeof data.stage === "string" ? data.stage : "processing";
        const message = typeof data.message === "string" ? data.message : "";
        return { label: message ? `${stage}: ${message}` : stage };
      }
      return null;
    }
    default:
      return null;
  }
}

function phaseOf(status: ServerJobStatus | null): PdfDocRunPhase {
  switch (status) {
    case null:
    case "connecting":
      return "checking";
    case "pending":
    case "running":
    case "paused":
    case "waiting_input":
      return "running";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "completed":
      return "done";
    case "none":
      return "idle";
  }
}

function endedBefore(endedAt: string | null | undefined, openedAt: number): boolean {
  if (!endedAt) return false;
  const t = Date.parse(endedAt);
  return Number.isFinite(t) && t < openedAt;
}

function errorText(error: Record<string, unknown> | null | undefined): string | null {
  if (!error) return null;
  const msg = error.user_message ?? error.message;
  return typeof msg === "string" && msg ? msg : null;
}

export function usePdfDocRun(args: {
  docId: string | null;
  /** This tab's own stream for the doc is running — it owns the screen. */
  localStreaming: boolean;
  /** Re-read the saved document (+ its pages) once the run settles. */
  onSettled: () => Promise<void> | void;
}): PdfDocRun {
  const { docId, localStreaming, onSettled } = args;
  const store = useAppStore();
  const [label, setLabel] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [trackedDoc, setTrackedDoc] = useState(docId);
  // When this document was opened here: a run that ended before it is old
  // news (no "Done", no reload); one that ended after it settled while we watched.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  if (trackedDoc !== docId) {
    setTrackedDoc(docId);
    setOpenedAt(Date.now());
    setLabel(null);
    setStreamingText(null);
  }

  const saved = readPdfRunRequest(docId);
  const target: ServerJobTarget | null = docId
    ? saved
      ? { requestId: saved.requestId }
      : { linkKind: "processed_document", linkId: docId }
    : null;

  const job = useServerJob({
    transport: () => createMatrxTransport(store.getState, { source: "pdf-run-reconnect" }),
    target,
    enabled: !localStreaming,
    onFrame: (envelope) => {
      if (!docId) return;
      const read = readPdfRunFrame(envelope, docId);
      if (!read) return;
      if (read.label) setLabel(read.label);
      if (read.text !== undefined) setStreamingText(read.text);
      if (read.appendText) setStreamingText((prev) => (prev ?? "") + read.appendText);
    },
    reloadSavedResult: async ({ operation }) => {
      if (docId) clearPdfRunRequest(docId, operation?.request_id ?? saved?.requestId);
      setLabel(null);
      setStreamingText(null);
      if (endedBefore(operation?.ended_at, openedAt)) return;
      await onSettled();
    },
  });

  const recordPhase = phaseOf(job.status);
  const settledEarlier = endedBefore(job.operation?.ended_at, openedAt);
  // "Done" / "Stopped" only for a run that settled while this page watched it.
  const phase: PdfDocRunPhase = localStreaming
    ? "running"
    : (recordPhase === "done" || recordPhase === "cancelled") && settledEarlier
      ? "idle"
      : recordPhase;
  const shownLabel =
    phase === "running"
      ? (label ?? PDF_RUN_LABEL.running)
      : phase === "failed"
        ? PDF_RUN_LABEL.failed
        : phase === "done"
          ? PDF_RUN_LABEL.done
          : phase === "cancelled"
            ? PDF_RUN_LABEL.cancelled
            : null;

  return {
    phase,
    status: job.status,
    label: localStreaming ? null : shownLabel,
    streamingText: localStreaming ? null : streamingText,
    errorMessage: errorText(job.outcome?.error ?? job.operation?.error),
    answered: job.error != null || (job.status !== null && job.status !== "connecting"),
    recheck: job.reconnect,
  };
}
