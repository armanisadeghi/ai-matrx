"use client";

/**
 * useStagesStatus — periodically (or on-demand) loads the per-stage
 * status of one document. Drives the colored pills on the library row
 * and detail sheet.
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchStagesStatus,
  type StagesStatusResponse,
} from "@/features/rag/api/stages";

export function useStagesStatus(processedDocumentId: string | null) {
  const [status, setStatus] = useState<StagesStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    if (!processedDocumentId) {
      setStatus(null);
      return undefined;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchStagesStatus(processedDocumentId, ctrl.signal)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [processedDocumentId, reloadKey]);

  return { status, loading, error, reload };
}
