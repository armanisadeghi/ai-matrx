"use client";

/**
 * useProcessingRunner — drives the new ProcessingProgressSheet, the
 * inline ActiveJobsStrip, and the floating JobsMiniDock.
 *
 * Multi-job model: any number of stage runs / full-pipeline runs can be
 * in flight at the same time. Each one is a `ProcessingJob` with its
 * own stream, frame, persisted per-stage previews, accumulated result,
 * error, and cancel handle. Jobs stay in the list after they complete
 * (with terminal status) until explicitly dismissed — so the user can
 * always look back at what just happened, including the streamed text
 * the stages produced.
 *
 * Two flavors:
 *
 *   1. runStage(processedDocumentId, stage, title, subtitle)
 *      Wraps runStageStream and translates the per-stage events into
 *      the ProcessingFrame shape the sheet renders.
 *
 *   2. runForCldFile(cldFileId, title, subtitle)
 *      Wraps the legacy ingestFileStream (POST /rag/ingest/stream) for
 *      the "I just uploaded a file, kick the pipeline" flow.
 *
 * Both return the new jobId so the caller can focus the sheet on the
 * job it just started.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { runStageStream, type StageName } from "@/features/rag/api/stages";
import {
  ingestFileStream,
  type IngestStreamEvent,
} from "@/features/rag/api/ingest";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import type {
  ProcessingFrame,
  ProcessingResultSummary,
  ProcessingStageId,
  StagePreview,
} from "@/features/rag/components/library/ProcessingProgressDialog";

export type JobStatus = "running" | "succeeded" | "failed" | "cancelled";

export type JobKind = "stage" | "pipeline";

export interface ProcessingJob {
  jobId: string;
  kind: JobKind;
  /** Document or file name shown in the header. */
  title: string;
  subtitle: string | null;
  startedAt: number;
  endedAt: number | null;
  status: JobStatus;

  /** Latest live progress frame from the stream. */
  frame: ProcessingFrame | null;

  /** Persisted previews per stage — NOT overwritten when the next stage
   *  starts. Lets the sheet render a column of stage cards. */
  stagePreviews: Partial<Record<ProcessingStageId, StagePreview>>;

  /** Per-stage one-line result summaries; accumulates as stages finish. */
  byStage: Partial<Record<ProcessingStageId, string>>;

  result: ProcessingResultSummary | null;
  error: string | null;

  /** Resolved processed_document id (for stage runs we have it from the
   *  start; for cld_file pipelines we may resolve it after completion). */
  processedDocumentId: string | null;
  /** Original cld_file id, if known. */
  cldFileId: string | null;
}

export interface UseProcessingRunner {
  jobs: ProcessingJob[];
  activeJobs: ProcessingJob[];
  /** True when any job is currently running. */
  hasActive: boolean;

  /** Start a single stage. Returns the new job's id. */
  runStage: (
    processedDocumentId: string,
    stage: StageName,
    title: string,
    subtitle?: string,
  ) => Promise<string>;

  /** Start the legacy /rag/ingest/stream pipeline against a cld_file id.
   *  Used right after an upload to kick the full extract → … → embed pipe.
   *  Returns the new job's id. */
  runForCldFile: (
    cldFileId: string,
    title: string,
    subtitle?: string,
  ) => Promise<string>;

  cancel: (jobId: string) => void;
  cancelAll: () => void;
  dismiss: (jobId: string) => void;
  dismissAll: () => void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

let _idSeq = 0;
function newJobId(): string {
  _idSeq += 1;
  return `job-${Date.now().toString(36)}-${_idSeq}`;
}

export function useProcessingRunner(): UseProcessingRunner {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const abortMap = useRef<Map<string, AbortController>>(new Map());

  // Cleanup on unmount: abort any still-running streams.
  useEffect(() => {
    const map = abortMap.current;
    return () => {
      for (const ac of map.values()) ac.abort();
      map.clear();
    };
  }, []);

  // ----- low-level mutators ----------------------------------------------

  const upsert = useCallback(
    (jobId: string, patch: (j: ProcessingJob) => ProcessingJob) => {
      setJobs((prev) => prev.map((j) => (j.jobId === jobId ? patch(j) : j)));
    },
    [],
  );

  // ----- public actions --------------------------------------------------

  const cancel = useCallback((jobId: string) => {
    const ac = abortMap.current.get(jobId);
    if (ac) {
      ac.abort();
      abortMap.current.delete(jobId);
    }
    setJobs((prev) =>
      prev.map((j) =>
        j.jobId === jobId && j.status === "running"
          ? { ...j, status: "cancelled", endedAt: Date.now() }
          : j,
      ),
    );
  }, []);

  const cancelAll = useCallback(() => {
    for (const [, ac] of abortMap.current) ac.abort();
    abortMap.current.clear();
    setJobs((prev) =>
      prev.map((j) =>
        j.status === "running"
          ? { ...j, status: "cancelled", endedAt: Date.now() }
          : j,
      ),
    );
  }, []);

  const dismiss = useCallback((jobId: string) => {
    setJobs((prev) =>
      prev.filter((j) => j.jobId !== jobId || j.status === "running"),
    );
  }, []);

  const dismissAll = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === "running"));
  }, []);

  // ----- runStage --------------------------------------------------------

  const runStage = useCallback<UseProcessingRunner["runStage"]>(
    async (processedDocumentId, stage, title, subtitle) => {
      const jobId = newJobId();
      const ac = new AbortController();
      abortMap.current.set(jobId, ac);

      const initialStage = stageNameToProcessingStageId(stage);
      const newJob: ProcessingJob = {
        jobId,
        kind: "stage",
        title,
        subtitle: subtitle ?? null,
        startedAt: Date.now(),
        endedAt: null,
        status: "running",
        frame: {
          activeStage: initialStage,
          message: "Starting…",
          fraction: null,
          current: 0,
          total: 0,
          lastUpdate: Date.now(),
        },
        stagePreviews: {},
        byStage: {},
        result: null,
        error: null,
        processedDocumentId,
        cldFileId: null,
      };
      setJobs((prev) => [newJob, ...prev]);

      void (async () => {
        try {
          for await (const ev of runStageStream(processedDocumentId, stage, {
            signal: ac.signal,
          })) {
            if (ac.signal.aborted) break;
            switch (ev.event) {
              case "stage.progress": {
                const stageId = stageNameToProcessingStageId(ev.data.stage);
                const frac =
                  ev.data.total > 0
                    ? Math.min(1, ev.data.current / ev.data.total)
                    : null;
                const extraPreview = (
                  ev.data.extra as Record<string, unknown> | undefined
                )?.preview as StagePreview | undefined;
                upsert(jobId, (j) => {
                  const nextPreviews = { ...j.stagePreviews };
                  if (extraPreview) nextPreviews[stageId] = extraPreview;
                  return {
                    ...j,
                    frame: {
                      activeStage: stageId,
                      message: ev.data.message,
                      fraction: frac,
                      current: ev.data.current,
                      total: ev.data.total,
                      lastUpdate: Date.now(),
                      latestPreview:
                        extraPreview ?? j.frame?.latestPreview ?? null,
                    },
                    stagePreviews: nextPreviews,
                  };
                });
                break;
              }
              case "stage.result": {
                const id = stageNameToProcessingStageId(
                  ev.data.stage as StageName,
                );
                const summary = summarizeStageResult(ev.data);
                upsert(jobId, (j) => ({
                  ...j,
                  byStage: { ...j.byStage, [id]: summary },
                }));
                break;
              }
              case "stage.error": {
                upsert(jobId, (j) => ({ ...j, error: ev.data.message }));
                break;
              }
              case "stage.end":
                break;
            }
          }
          // Stream ended naturally (or aborted).
          if (!ac.signal.aborted) {
            upsert(jobId, (j) => ({
              ...j,
              status: j.error ? "failed" : "succeeded",
              endedAt: Date.now(),
              result: j.error
                ? null
                : {
                    byStage: j.byStage,
                    processedDocumentId: j.processedDocumentId,
                    headline: synthHeadline(j.byStage),
                  },
            }));
          }
        } catch (err) {
          if (!ac.signal.aborted) {
            const msg = err instanceof Error ? err.message : String(err);
            upsert(jobId, (j) => ({
              ...j,
              status: "failed",
              endedAt: Date.now(),
              error: msg,
            }));
          }
        } finally {
          abortMap.current.delete(jobId);
        }
      })();

      return jobId;
    },
    [upsert],
  );

  // ----- runForCldFile ---------------------------------------------------

  const runForCldFile = useCallback<UseProcessingRunner["runForCldFile"]>(
    async (cldFileId, title, subtitle) => {
      const jobId = newJobId();
      const ac = new AbortController();
      abortMap.current.set(jobId, ac);

      const newJob: ProcessingJob = {
        jobId,
        kind: "pipeline",
        title,
        subtitle: subtitle ?? "Full pipeline",
        startedAt: Date.now(),
        endedAt: null,
        status: "running",
        frame: {
          activeStage: "extract",
          message: "Starting…",
          fraction: null,
          current: 0,
          total: 0,
          lastUpdate: Date.now(),
        },
        stagePreviews: {},
        byStage: {},
        result: null,
        error: null,
        processedDocumentId: null,
        cldFileId,
      };
      setJobs((prev) => [newJob, ...prev]);

      void (async () => {
        try {
          for await (const ev of ingestFileStream(cldFileId, {
            force: false,
            signal: ac.signal,
          })) {
            if (ac.signal.aborted) break;
            handleIngestEvent(ev, jobId, upsert);
            if (ev.event === "rag.ingest.complete") {
              const r = ev.data;
              let pdid: string | null = r.processed_document_id ?? null;
              if (!pdid) {
                try {
                  const lookup = await fetch(
                    `/rag/library?source_kind=cld_file&search=&limit=5&offset=0`,
                    { credentials: "include" },
                  );
                  if (lookup.ok) {
                    const j = await lookup.json();
                    const match = (j?.documents ?? []).find(
                      (d: { source_id?: string }) => d.source_id === cldFileId,
                    );
                    if (match?.id) pdid = match.id as string;
                  }
                } catch {
                  /* best-effort only */
                }
              }
              upsert(jobId, (j) => ({
                ...j,
                status: r.error ? "failed" : "succeeded",
                endedAt: Date.now(),
                processedDocumentId: pdid ?? j.processedDocumentId,
                error: r.error ?? null,
                result: r.error
                  ? null
                  : {
                      headline: `Indexed ${r.chunks_written.toLocaleString()} ${RAG_VOCAB.segmentsShort.toLowerCase()} (${r.embeddings_written.toLocaleString()} embeddings) via ${r.embedding_model}.`,
                      byStage: {
                        ...j.byStage,
                        embed:
                          j.byStage.embed ??
                          `${r.embeddings_written.toLocaleString()} embeddings written`,
                        chunk:
                          j.byStage.chunk ??
                          `${r.chunks_written.toLocaleString()} ${RAG_VOCAB.segmentsShort.toLowerCase()} written`,
                      },
                      processedDocumentId: pdid ?? j.processedDocumentId,
                    },
              }));
              return;
            }
            if (ev.event === "rag.ingest.error") {
              upsert(jobId, (j) => ({
                ...j,
                status: "failed",
                endedAt: Date.now(),
                error: ev.data.message,
              }));
              return;
            }
          }
          if (!ac.signal.aborted) {
            // Stream closed without a complete/error event.
            upsert(jobId, (j) =>
              j.status === "running"
                ? { ...j, status: "succeeded", endedAt: Date.now() }
                : j,
            );
          }
        } catch (err) {
          if (!ac.signal.aborted) {
            const msg = err instanceof Error ? err.message : String(err);
            upsert(jobId, (j) => ({
              ...j,
              status: "failed",
              endedAt: Date.now(),
              error: msg,
            }));
          }
        } finally {
          abortMap.current.delete(jobId);
        }
      })();

      return jobId;
    },
    [upsert],
  );

  const activeJobs = jobs.filter((j) => j.status === "running");

  return {
    jobs,
    activeJobs,
    hasActive: activeJobs.length > 0,
    runStage,
    runForCldFile,
    cancel,
    cancelAll,
    dismiss,
    dismissAll,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleIngestEvent(
  ev: IngestStreamEvent,
  jobId: string,
  upsert: (jobId: string, patch: (j: ProcessingJob) => ProcessingJob) => void,
) {
  if (ev.event !== "rag.ingest.progress") return;
  const id = legacyStageToProcessingStageId(ev.data.stage);
  if (!id) return;
  const frac =
    ev.data.total > 0 ? Math.min(1, ev.data.current / ev.data.total) : null;
  const preview = (ev.data.preview as StagePreview | null) ?? null;
  upsert(jobId, (j) => {
    const nextPreviews = { ...j.stagePreviews };
    if (preview) nextPreviews[id] = preview;
    return {
      ...j,
      frame: {
        activeStage: id,
        message: ev.data.message ?? ev.data.stage,
        fraction: frac,
        current: ev.data.current,
        total: ev.data.total,
        lastUpdate: Date.now(),
        latestPreview: preview ?? j.frame?.latestPreview ?? null,
      },
      stagePreviews: nextPreviews,
    };
  });
}

function stageNameToProcessingStageId(s: StageName): ProcessingStageId {
  if (s === "extract" || s === "clean" || s === "chunk" || s === "embed") {
    return s;
  }
  return "extract";
}

function legacyStageToProcessingStageId(s: string): ProcessingStageId | null {
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
      return null;
  }
}

function summarizeStageResult(d: Record<string, unknown>): string {
  const stage = d.stage as string;
  const n = (k: string) =>
    typeof d[k] === "number" ? (d[k] as number).toLocaleString() : "0";
  switch (stage) {
    case "extract":
      return `${n("pages_count")} pages extracted (${n("ocr_pages")} via OCR)`;
    case "clean":
      return `${n("pages_cleaned")} pages cleaned (${n("cleaned_chars")} chars)`;
    case "chunk":
      return `${n("chunks_written")} ${RAG_VOCAB.segmentsShort.toLowerCase()} (${n("parents")} parents, ${n("children")} children)`;
    case "embed":
      return `${n("chunks_embedded")} new vectors (${n("chunks_already_embedded")} already done)`;
    default:
      return "Done";
  }
}

function synthHeadline(
  byStage: Partial<Record<ProcessingStageId, string>>,
): string | undefined {
  const parts: string[] = [];
  if (byStage.extract) parts.push(byStage.extract);
  if (byStage.chunk) parts.push(byStage.chunk);
  if (byStage.embed) parts.push(byStage.embed);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
