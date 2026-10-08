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

import { useEffect, useRef, useState } from "react";
import { useServerJob } from "@ai-matrx/agents/react";
import { getRuntimeOperationsByLink } from "@ai-matrx/agents/matrx";
import type {
  MatrxRuntimeOperationView,
  ServerJobStatus,
  ServerJobTarget,
} from "@ai-matrx/agents/matrx";
import type { MatrxStreamEnvelope } from "@ai-matrx/agents/stream/ndjson";
import { describeRunError } from "../service/cleanOutcome";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { useAppStore } from "@/lib/redux/hooks";
import {
  clearPdfRunRequest,
  readPdfRunRequest,
  type PdfRunRequest,
} from "../state/runRequests";

export type PdfDocRunPhase = "checking" | "unavailable" | "running" | "failed" | "done" | "cancelled" | "idle";

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
  /** The server really answered — safe to decide on auto-runs. A failed lookup is never an answer. */
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
): { label?: string; text?: string; appendText?: string; counter?: boolean; generic?: boolean } | null {
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
      if (data.type === "pdf_clean_started") return { label: PDF_RUN_LABEL.running, generic: true };
      if (data.kind === "content.processing.progress") {
        const forDoc = data.processed_document_id;
        if (forDoc && forDoc !== docId) return null;
        const stage = typeof data.stage === "string" ? data.stage : "processing";
        const message = typeof data.message === "string" ? data.message : "";
        const phase = typeof data.phase === "string" ? data.phase : "";
        const current = typeof data.current === "number" ? data.current : 0;
        const total = typeof data.total === "number" ? data.total : 0;
        // A per-page frame is the live counter ("Cleaned page 32/48").
        if (total > 0 && current > 0 && (phase === "page" || phase === "progress")) {
          const base = message || `${stage} page`;
          const tail = `${current}/${total}`;
          return { label: base.includes(tail) ? base : `${base} ${tail}`, counter: true };
        }
        const label = message ? `${stage}: ${message}` : stage;
        return phase === "heartbeat" || phase === "started" ? { label, generic: true } : { label };
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Which run to follow for the open doc. The doc's OWN run (its `processed_document`
 * link) is the truth for status: after a refresh mid-batch the saved request id is
 * the whole BATCH's, which stays "running" until every file is done. The saved id
 * only replays the stream when the doc has no run of its own yet — and a saved AI
 * clean IS the doc's own run, so it is followed directly.
 */
const LOOKUP_RETRY_MS = [1_000, 2_000, 4_000];

/**
 * Runs that belong to THIS doc. The server may answer a batch doc's by-link
 * lookup with the batch's root run (older shape) or the doc's own child run
 * (newer): an operation linked to another record is not the doc's run.
 */
export function countOwnRuns(
  operations: ReadonlyArray<{ link_kind: string | null; link_id: string | null }> | null | undefined,
  docId: string,
): number {
  if (!operations) return 0;
  return operations.filter(
    (op) =>
      !op.link_id ||
      (op.link_id === docId && (!op.link_kind || op.link_kind === "processed_document")),
  ).length;
}

export function choosePdfRunTarget(
  docId: string | null,
  saved: PdfRunRequest | null,
  /** null = the by-link lookup has not answered yet; [] = the doc has no run. */
  linkRunCount: number | null,
): ServerJobTarget | null {
  if (!docId) return null;
  if (saved?.kind === "clean") return { requestId: saved.requestId };
  if (linkRunCount === null) return null;
  if (linkRunCount > 0 || !saved) return { linkKind: "processed_document", linkId: docId };
  return { requestId: saved.requestId };
}

const LOOKUP_SHARE_MS = 10_000;
type LinkOps = ReadonlyArray<MatrxRuntimeOperationView>;
const sharedLookups = new Map<string, { at: number; promise: Promise<LinkOps> }>();

/**
 * One by-link read per doc: the run probe AND the follow's identify step (via
 * `useServerJob`'s `identifyLink`), StrictMode's double effect, a re-render
 * that flips the probe off and on, and desktop + mobile shells all share the
 * same in-flight call (and a fresh answer for a few seconds). `fresh` (Retry)
 * skips the share. A failure is never kept.
 */
export function lookupLinkOperations(
  run: () => Promise<LinkOps>,
  docId: string,
  fresh = false,
  now: number = Date.now(),
): Promise<LinkOps> {
  const hit = sharedLookups.get(docId);
  if (!fresh && hit && now - hit.at < LOOKUP_SHARE_MS) return hit.promise;
  const promise = run();
  sharedLookups.set(docId, { at: now, promise });
  promise.catch(() => {
    if (sharedLookups.get(docId)?.promise === promise) sharedLookups.delete(docId);
  });
  return promise;
}

/** Test seam. */
export function resetSharedPdfRunLookups(): void {
  sharedLookups.clear();
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
  const hasCounter = useRef(false);
  const labelRef = useRef<string | null>(null);
  const [trackedDoc, setTrackedDoc] = useState(docId);
  // When this document was opened here: a run that ended before it is old
  // news (no "Done", no reload); one that ended after it settled while we watched.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  if (trackedDoc !== docId) {
    setTrackedDoc(docId);
    hasCounter.current = false;
    labelRef.current = null;
    setOpenedAt(Date.now());
    setLabel(null);
    setStreamingText(null);
  }

  const saved = readPdfRunRequest(docId);
  // How many runs the server holds for THIS doc (its own, not the batch's).
  const [linkProbe, setLinkProbe] = useState<{ docId: string; count: number } | null>(null);
  const [probeFailed, setProbeFailed] = useState<string | null>(null);
  const [followFailed, setFollowFailed] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // The ONE by-link read for this doc: the probe below and the follow's
  // identify step both go through it (shared in-flight + short cache).
  const readLinkOperations = (id: string, fresh = false): Promise<LinkOps> =>
    lookupLinkOperations(
      async () =>
        (
          await getRuntimeOperationsByLink(
            createMatrxTransport(store.getState, { source: "pdf-run-reconnect" }),
            "processed_document",
            id,
            { limit: 5 },
          )
        )?.operations ?? [],
      id,
      fresh,
    );
  const needsProbe = Boolean(docId) && saved?.kind !== "clean";
  useEffect(() => {
    if (!docId || !needsProbe) return;
    const controller = new AbortController();
    void (async () => {
      for (let attempt = 0; attempt <= LOOKUP_RETRY_MS.length; attempt++) {
        try {
          const ops = await readLinkOperations(docId, nonce > 0 || attempt > 0);
          const count = countOwnRuns(ops, docId);
          if (controller.signal.aborted) return;
          setProbeFailed(null);
          setLinkProbe({ docId, count });
          return;
        } catch {
          if (controller.signal.aborted) return;
          if (attempt === LOOKUP_RETRY_MS.length) break;
          await new Promise((r) => setTimeout(r, LOOKUP_RETRY_MS[attempt]));
          if (controller.signal.aborted) return;
        }
      }
      setProbeFailed(docId);
    })();
    return () => controller.abort();
  }, [docId, needsProbe, store, nonce]);
  const probed = linkProbe && linkProbe.docId === docId ? linkProbe.count : null;
  const target = choosePdfRunTarget(docId, saved, needsProbe ? probed : 0);

  const job = useServerJob({
    transport: () => createMatrxTransport(store.getState, { source: "pdf-run-reconnect" }),
    target,
    enabled: !localStreaming,
    identifyLink: (kind, id) =>
      kind === "processed_document" ? readLinkOperations(id) : Promise.resolve([]),
    onFrame: (envelope) => {
      if (!docId) return;
      const read = readPdfRunFrame(envelope, docId);
      if (!read) return;
      if (read.label) {
        // Richer live progress is never overwritten by a generic frame or the
        // run record's plain "Cleaning…": a counter holds until a newer one.
        const { label: next, counter, generic } = read;
        if (counter) hasCounter.current = true;
        else if (generic && (hasCounter.current || labelRef.current)) return;
        else if (!generic) hasCounter.current = false;
        labelRef.current = next;
        setLabel(next);
      }
      if (read.text !== undefined) setStreamingText(read.text);
      if (read.appendText) setStreamingText((prev) => (prev ?? "") + read.appendText);
    },
    reloadSavedResult: async ({ operation }) => {
      if (docId) clearPdfRunRequest(docId, operation?.request_id ?? saved?.requestId);
      hasCounter.current = false;
      labelRef.current = null;
      setLabel(null);
      setStreamingText(null);
      if (endedBefore(operation?.ended_at, openedAt)) return;
      await onSettled();
    },
  });

  // A lookup that fails retries with backoff; only after the retries are spent
  // does the screen say so ("unavailable" + Retry) — never a silent guess.
  const followAttempts = useRef(0);
  const lookupFailing = job.error != null && !localStreaming;
  useEffect(() => {
    if (!lookupFailing) {
      if (job.status !== null && job.status !== "connecting") followAttempts.current = 0;
      setFollowFailed(null);
      return;
    }
    if (followAttempts.current >= LOOKUP_RETRY_MS.length) {
      setFollowFailed(docId);
      return;
    }
    const delay = LOOKUP_RETRY_MS[followAttempts.current++];
    const timer = setTimeout(() => job.reconnect(), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the failure itself
  }, [lookupFailing, job.error, docId]);
  // Only a real, open doc can be "unavailable" — no doc, no lookup, no banner.
  const unavailable =
    Boolean(docId) && !localStreaming && (probeFailed === docId || followFailed === docId);
  const recheck = () => {
    followAttempts.current = 0;
    setProbeFailed(null);
    setFollowFailed(null);
    setNonce((n) => n + 1);
    job.reconnect();
  };

  const recordPhase = phaseOf(job.status);
  const settledEarlier = endedBefore(job.operation?.ended_at, openedAt);
  // "Done" / "Stopped" only for a run that settled while this page watched it.
  const phase: PdfDocRunPhase = localStreaming
    ? "running"
    : unavailable
      ? "unavailable"
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
    errorMessage: describeRunError(job.outcome?.error ?? job.operation?.error),
    answered:
      !unavailable &&
      job.error == null &&
      job.status !== null &&
      job.status !== "connecting",
    recheck,
  };
}
