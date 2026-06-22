"use client";

/**
 * IngestProgressDialog — adapter that drives ProcessingProgressDialog
 * from the legacy useFileIngest hook (which streams /rag/ingest/stream).
 *
 * Used by the Files page's Document tab so a re-process from there gets
 * the same beautiful full-screen dialog as the new Library Upload flow.
 */

import { useMemo, useRef } from "react";
import {
  ProcessingProgressDialog,
  type ProcessingFrame,
  type ProcessingStageId,
  type ProcessingResultSummary,
} from "./ProcessingProgressDialog";
import type { UseFileIngestState } from "@/features/rag/hooks/useFileIngest";
import type { IngestProgress } from "@/features/rag/api/ingest";
import {
  RAG_PIPELINE_SUBTITLE,
  RAG_VOCAB,
} from "@/features/rag/constants/vocabulary";

interface IngestHandle extends UseFileIngestState {
  cancel: () => void;
  reset: () => void;
}

export interface IngestProgressDialogProps {
  /** When true, the dialog is open. When the run reaches a terminal
   *  state, the dialog stays open showing the result/error until the
   *  user closes it. */
  open: boolean;
  fileName: string;
  ingest: IngestHandle;
  /** Called when the user closes the dialog AFTER the run has reached
   *  a terminal state. */
  onClose: () => void;
  /** Open straight into the floating widget instead of the full overlay.
   *  See ProcessingProgressDialog for behaviour. */
  defaultMinimized?: boolean;
}

export function IngestProgressDialog({
  open,
  fileName,
  ingest,
  onClose,
  defaultMinimized,
}: IngestProgressDialogProps) {
  // Track the last update time so the dialog's "Xs ago" indicator is real.
  const lastUpdateRef = useRef<number>(Date.now());
  if (ingest.progress) {
    lastUpdateRef.current = Date.now();
  }

  const frame: ProcessingFrame | null = useMemo(() => {
    if (!ingest.progress) {
      return ingest.status === "running"
        ? {
            activeStage: "extract",
            message: "Starting…",
            fraction: null,
            current: 0,
            total: 0,
            lastUpdate: lastUpdateRef.current,
          }
        : null;
    }
    return progressToFrame(ingest.progress, lastUpdateRef.current);
  }, [ingest.progress, ingest.status]);

  const result: ProcessingResultSummary | null = useMemo(() => {
    if (ingest.status !== "complete" || !ingest.result) return null;
    const r = ingest.result;
    return {
      headline: `Indexed ${r.chunks_written.toLocaleString()} ${RAG_VOCAB.segmentsShort.toLowerCase()} · ${r.embeddings_written.toLocaleString()} embeddings via ${r.embedding_model}.`,
      byStage: {
        chunk: `${r.chunks_written.toLocaleString()} ${RAG_VOCAB.segmentsShort.toLowerCase()} written`,
        embed: `${r.embeddings_written.toLocaleString()} embeddings written`,
      },
      // Threaded through so the minimized widget and full success view
      // can deep-link to /rag/library/<id>/preview when the user wants
      // to open the freshly-indexed document in a new tab.
      processedDocumentId: r.processed_document_id ?? null,
    };
  }, [ingest.status, ingest.result]);

  return (
    <ProcessingProgressDialog
      open={open}
      title={fileName || "Processing"}
      subtitle={RAG_PIPELINE_SUBTITLE}
      frame={frame}
      result={result}
      error={ingest.error}
      onCancel={ingest.cancel}
      onClose={onClose}
      defaultMinimized={defaultMinimized}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progressToFrame(
  p: IngestProgress,
  lastUpdate: number,
): ProcessingFrame {
  const stage = legacyStageToId(p.stage);
  const fraction = p.total > 0 ? Math.min(1, p.current / p.total) : null;
  return {
    activeStage: stage,
    message: p.message ?? p.stage,
    fraction,
    current: p.current,
    total: p.total,
    lastUpdate,
    latestPreview: (p.preview as ProcessingFrame["latestPreview"]) ?? null,
  };
}

function legacyStageToId(s: IngestProgress["stage"]): ProcessingStageId {
  switch (s) {
    case "fetch":
    case "extract":
      return "extract";
    case "cleanup":
      return "clean";
    case "chunk":
      return "chunk";
    case "embed":
    case "upsert":
    case "complete":
      return "embed";
    default:
      return "extract";
  }
}
