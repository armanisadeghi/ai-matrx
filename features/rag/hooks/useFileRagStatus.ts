/**
 * features/rag/hooks/useFileRagStatus.ts
 *
 * React Query hook for a file's scheduled auto-RAG lifecycle, plus the
 * on-demand trigger / refresh actions.
 *
 * Polling is conditional: tight while a job is `running`, relaxed while
 * `scheduled`, and OFF on any terminal state — so an open dialog doesn't
 * poll a finished file forever, and a closed dialog (query unmounted) stops
 * entirely.
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setRagStatusForFile } from "@/features/files/redux/slice";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import { clearFileDocumentCache } from "@/features/files/api/document-lookup";
import {
  fetchFileRagStatus,
  isRagAlreadyComplete,
  refreshFileRag,
  triggerFileIngestNow,
  type FileRagStatus,
} from "@/features/rag/api/rag-jobs";

/** Match the `detail` shape `useFileIngest.ts` dispatches for this event. */
const PROCESSED_EVENT = "cloud-files:document-processed";

export const ragJobKeys = {
  fileStatus: (fileId: string) => ["rag", "file-status", fileId] as const,
};

const RUNNING_POLL_MS = 3_000;
const SCHEDULED_POLL_MS = 15_000;

export interface UseFileRagStatusResult {
  status: FileRagStatus | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFileRagStatus(
  fileId: string | null,
  opts: { enabled?: boolean } = {},
): UseFileRagStatusResult {
  const enabled =
    (opts.enabled ?? true) && !!fileId && !isSyntheticId(fileId ?? "");

  const query = useQuery({
    queryKey: ragJobKeys.fileStatus(fileId ?? "none"),
    queryFn: ({ signal }) => fetchFileRagStatus(fileId as string, signal),
    enabled,
    staleTime: 5_000,
    refetchInterval: (q) => {
      const state = q.state.data?.state;
      if (state === "running") return RUNNING_POLL_MS;
      if (state === "scheduled") return SCHEDULED_POLL_MS;
      return false; // terminal — stop polling
    },
  });

  // ── Coherence bridge ──────────────────────────────────────────────────────
  //
  // When the polled status transitions INTO `completed` (e.g. a scheduled or
  // background job finished while this hook was open), keep the rest of the app
  // in sync — the file-lookup cache, the DocumentTab probe, and the file-table
  // RAG column — exactly as `useFileIngest` does after an on-demand ingest.
  // Guarded to fire only on the rising edge into `completed` so it never
  // re-dispatches on every poll.
  const dispatch = useAppDispatch();
  const wasCompletedRef = useRef(false);
  const completed = query.data?.state === "completed";
  useEffect(() => {
    if (!fileId) return;
    if (completed && !wasCompletedRef.current) {
      clearFileDocumentCache(fileId);
      window.dispatchEvent(
        new CustomEvent(PROCESSED_EVENT, { detail: { fileId } }),
      );
      // Keep the file-table RAG column truthful without a separate fetch.
      dispatch(setRagStatusForFile({ fileId, status: "indexed" }));
    }
    wasCompletedRef.current = completed;
  }, [completed, fileId, dispatch]);

  return {
    status: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: () => void query.refetch(),
  };
}

export interface UseFileRagActionsResult {
  processNow: () => void;
  processNowPending: boolean;
  refresh: () => void;
  refreshPending: boolean;
}

export function useFileRagActions(
  fileId: string | null,
): UseFileRagActionsResult {
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    if (fileId) {
      void qc.invalidateQueries({ queryKey: ragJobKeys.fileStatus(fileId) });
    }
  }, [qc, fileId]);

  const refreshMutation = useMutation({
    mutationFn: () => refreshFileRag(fileId as string),
    onSuccess: () => {
      invalidate();
      toast.success("Refresh started", {
        description: "Re-processing this file for RAG.",
      });
    },
    onError: (err: unknown) => {
      toast.error((err as Error)?.message ?? "Refresh failed");
    },
  });

  const processMutation = useMutation({
    mutationFn: () => triggerFileIngestNow(fileId as string),
    onSuccess: () => {
      invalidate();
      toast.success("Processing started", {
        description: "Running RAG now instead of waiting for the schedule.",
      });
    },
    onError: (err: unknown) => {
      if (isRagAlreadyComplete(err)) {
        toast.info("Already processed for RAG", {
          description:
            "This file is already in the knowledge base. Use Refresh to re-run it.",
          action: {
            label: "Refresh",
            onClick: () => refreshMutation.mutate(),
          },
        });
        return;
      }
      toast.error((err as Error)?.message ?? "Processing failed");
    },
  });

  return {
    processNow: () => processMutation.mutate(),
    processNowPending: processMutation.isPending,
    refresh: () => refreshMutation.mutate(),
    refreshPending: refreshMutation.isPending,
  };
}
