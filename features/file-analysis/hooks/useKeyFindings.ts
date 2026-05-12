/**
 * features/file-analysis/hooks/useKeyFindings.ts
 *
 * Flattened {label: [values]} feed driven by user annotations. Used by the
 * Findings panel + the PD Rating Calculator bridge.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type { KeyFindingsResponse } from "@/features/file-analysis/api/file-analysis";

export interface UseKeyFindingsResult {
  data: KeyFindingsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useKeyFindings(fileId: string | null): UseKeyFindingsResult {
  const [data, setData] = useState<KeyFindingsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(!!fileId);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const refetch = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    if (!fileId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Api.getKeyFindings(fileId)
      .then(({ data }) => {
        if (cancelled) return;
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractErrorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, retry]);

  return { data, loading, error, refetch };
}
