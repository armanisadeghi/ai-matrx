/**
 * features/file-analysis/hooks/useFileAnalysis.ts
 *
 * Load + subscribe to the analysis state for a single file.
 *
 * Returns the full `{ head, results }` from `GET /files/{id}/analysis`, then
 * subscribes to Supabase Realtime on `file_analysis` (head row) and
 * `file_analysis_result` (per-detector results) so the UI streams progress
 * as the backend pipeline lands. No polling.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import { createClient } from "@/utils/supabase/client";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type {
  FileAnalysisResponse,
  FileAnalysisResultRow,
} from "@/features/file-analysis/api/file-analysis";

export interface UseFileAnalysisResult {
  data: FileAnalysisResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFileAnalysis(fileId: string | null): UseFileAnalysisResult {
  const [data, setData] = useState<FileAnalysisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(!!fileId);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // Stable ref so the Realtime channel's callbacks always see the latest data.
  const dataRef = useRef<FileAnalysisResponse | null>(null);
  dataRef.current = data;

  const refetch = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    if (!fileId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Api.getAnalysis(fileId)
      .then(({ data }) => {
        if (cancelled) return;
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = extractErrorMessage(err);
        if (msg.includes("no_analysis") || msg.includes("404")) {
          // No analysis row yet — that's a valid empty state. Don't surface as error.
          setData(null);
        } else {
          setError(msg);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, retry]);

  // Realtime subscription — file_analysis HEAD UPDATE + file_analysis_result INSERT.
  useEffect(() => {
    if (!fileId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`file-analysis:${fileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "file_analysis",
          filter: `file_id=eq.${fileId}`,
        },
        () => {
          // Cheap path: just refetch. The body is small and the FE doesn't
          // need to merge field-by-field.
          setRetry((n) => n + 1);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "file_analysis_result",
          filter: `file_id=eq.${fileId}`,
        },
        (payload) => {
          // Append to results optimistically; the next full refetch will
          // dedupe via the DISTINCT-ON server query.
          const next = payload.new as Partial<FileAnalysisResultRow> | undefined;
          if (!next || !next.id) return;
          const current = dataRef.current;
          if (!current) {
            setRetry((n) => n + 1);
            return;
          }
          setData({
            ...current,
            results: [next as FileAnalysisResultRow, ...current.results],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fileId]);

  return { data, loading, error, refetch };
}
