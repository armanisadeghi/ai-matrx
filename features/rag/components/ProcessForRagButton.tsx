/**
 * features/rag/components/ProcessForRagButton.tsx
 *
 * Reusable "Process for RAG" toolbar/menu button. Designed to drop into
 * any per-source-kind editor — Notes, code editors, agent-app editors —
 * so each one gets a consistent affordance to push its current row
 * through `/rag/ingest` with the right `source_kind`.
 *
 * Why centralise this:
 *   - The cloud-files DocumentTab already covers `cld_file` ingestion.
 *     Notes / code rows live in their own editors and would otherwise
 *     have to recreate the streaming-progress UX from scratch.
 *   - The hook + button pair below mirror the cloud-files Document tab's
 *     state machine (idle / running / complete / error) so the visuals
 *     match across surfaces. Editors can render either the icon-button
 *     compact variant (toolbar) or the labeled variant (menu item).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import {
  ingestFileStream,
  type IngestProgress,
  type IngestRequestBody,
} from "@/features/rag/api/ingest";
import { cn } from "@/lib/utils";

export interface ProcessForRagButtonProps {
  /** "cld_file" | "note" | "code_file" — which Python source kind to ingest. */
  sourceKind: IngestRequestBody["source_kind"];
  /** Row id (note id, code-file id, file id). */
  sourceId: string | null;
  /** Optional field id for multi-field rows (e.g. tool_ui_components). */
  fieldId?: string | null;
  /** Force re-ingest even if checksum unchanged. Default false. */
  force?: boolean;
  /** Compact icon-only mode for tight toolbars. Default false (label + icon). */
  iconOnly?: boolean;
  className?: string;
  disabled?: boolean;
  /**
   * Called once after a successful ingest completes — most editors
   * want to surface a transient toast or push to their own activity
   * panel.
   */
  onComplete?: () => void;
}

/**
 * Internal: streams `/rag/ingest/stream` and tracks progress. Same shape
 * as `useFileIngest` but accepts an arbitrary source kind (notes /
 * code-files / future).
 */
function useSourceIngest({
  sourceKind,
  sourceId,
  fieldId,
}: {
  sourceKind: IngestRequestBody["source_kind"];
  sourceId: string | null;
  fieldId?: string | null;
}) {
  const [status, setStatus] = useState<
    "idle" | "running" | "complete" | "error"
  >("idle");
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Snap back to idle when the source row changes — the in-flight
  // ingest is for the previous note/file and we don't want stale
  // progress confusing the user.
  useEffect(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setProgress(null);
    setError(null);
  }, [sourceKind, sourceId, fieldId]);

  const run = useCallback(
    async (opts: { force?: boolean } = {}): Promise<void> => {
      if (!sourceId) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setStatus("running");
      setError(null);
      setProgress(null);
      try {
        // The streaming helper in `rag-ingest.ts` is hard-coded to
        // `cld_file`. We still want streaming for notes/code, but using
        // the cloud-files helper would mis-tag the source. Re-implement
        // the line-stream parse against the same endpoint, with the
        // correct body. Tiny duplicate but clean separation of concerns.
        const { buildHeaders, resolveBaseUrl } =
          await import("@/lib/python-client");
        const { headers } = await buildHeaders({ signal: ac.signal }, true);
        const body: IngestRequestBody = {
          source_kind: sourceKind,
          source_id: sourceId,
          field_id: fieldId ?? null,
          force: opts.force ?? false,
        };
        const response = await fetch(`${resolveBaseUrl()}/rag/ingest/stream`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        if (!response.ok || !response.body) {
          setStatus("error");
          setError(`HTTP ${response.status}`);
          return;
        }
        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        let buffer = "";
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          let nl = buffer.indexOf("\n");
          while (nl !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line.length > 0) {
              try {
                const evt = JSON.parse(line) as {
                  event: string;
                  data: unknown;
                };
                if (evt.event === "rag.ingest.progress") {
                  setProgress(evt.data as IngestProgress);
                } else if (evt.event === "rag.ingest.complete") {
                  setStatus("complete");
                  setProgress(null);
                  return;
                } else if (evt.event === "rag.ingest.error") {
                  const errData = evt.data as { message?: string };
                  setStatus("error");
                  setError(errData.message ?? "Ingest failed");
                  return;
                }
              } catch {
                /* ignore malformed line, keep reading */
              }
            }
            nl = buffer.indexOf("\n");
          }
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Ingest failed");
      }
    },
    [sourceKind, sourceId, fieldId],
  );

  return { status, progress, error, run };
}

export function ProcessForRagButton({
  sourceKind,
  sourceId,
  fieldId,
  force = false,
  iconOnly = false,
  className,
  disabled,
  onComplete,
}: ProcessForRagButtonProps) {
  const { status, progress, error, run } = useSourceIngest({
    sourceKind,
    sourceId,
    fieldId,
  });

  // Fire `onComplete` once per transition into the complete state.
  const lastNotifiedStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (status === "complete" && lastNotifiedStatusRef.current !== status) {
      onComplete?.();
    }
    lastNotifiedStatusRef.current = status;
  }, [status, onComplete]);

  const tooltip =
    status === "running"
      ? `Processing… ${progress?.stage ?? "starting"} ${progress ? `(${progress.current}/${progress.total})` : ""}`
      : status === "error"
        ? `Ingest failed: ${error ?? "unknown error"}`
        : status === "complete"
          ? "Indexed for RAG"
          : "Process this for RAG search and citations";

  const handleClick = useCallback(() => {
    if (status === "running") return;
    void run({ force });
  }, [run, force, status]);

  const isBusy = status === "running";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !sourceId || isBusy}
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-background text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
        iconOnly ? "h-7 w-7 justify-center p-0" : "h-7 px-2",
        status === "complete" &&
          "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        status === "error" && "border-destructive/40 text-destructive",
        className,
      )}
    >
      {isBusy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Rocket className="h-3.5 w-3.5" />
      )}
      {!iconOnly && (
        <span>
          {isBusy
            ? "Processing…"
            : status === "complete"
              ? "Indexed"
              : "Process for RAG"}
        </span>
      )}
    </button>
  );
}

export default ProcessForRagButton;
