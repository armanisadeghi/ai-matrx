/**
 * features/sharing/hooks/useAccessSummary.ts
 *
 * One-entity-at-a-time effective-access loader. `enabled` exists so callers can
 * mount the panel inside a collapsed tab and only pay for the round trip when
 * the user actually looks — this query is NOT cheap enough to fire per row.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAccessSummary,
  type AccessSummary,
} from "@/features/sharing/service/accessSummary";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface UseAccessSummaryArgs {
  entityType: EntityTypeToken;
  entityId: string | null;
  /** Load only while true. Defaults to true. */
  enabled?: boolean;
  /**
   * Change this value to force a refetch — for surfaces that mutate grants
   * beside the panel (a Share tab), pass a signature of the grant state so
   * the summary can never contradict the freshly-refreshed list next to it.
   */
  refreshToken?: unknown;
}

export interface UseAccessSummaryResult {
  summary: AccessSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAccessSummary({
  entityType,
  entityId,
  enabled = true,
  refreshToken,
}: UseAccessSummaryArgs): UseAccessSummaryResult {
  const [summary, setSummary] = useState<AccessSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // A slow response for a previous entity must never overwrite the current one.
  const requestKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !entityId) {
      requestKey.current = null;
      setSummary(null);
      setError(null);
      setLoading(false);
      return;
    }

    const key = `${entityType}:${entityId}:${nonce}:${String(refreshToken)}`;
    requestKey.current = key;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const next = await fetchAccessSummary(entityType, entityId);
        if (requestKey.current !== key) return;
        setSummary(next);
      } catch (cause) {
        if (requestKey.current !== key) return;
        setSummary(null);
        setError(
          cause instanceof Error ? cause.message : "Could not load access",
        );
      } finally {
        if (requestKey.current === key) setLoading(false);
      }
    })();
  }, [entityType, entityId, enabled, nonce, refreshToken]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { summary, loading, error, reload };
}
