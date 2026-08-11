"use client";

/**
 * useAccessGate — one hook, one honest answer.
 *
 * A surface whose read came back empty calls this with the entity it was trying
 * to open, and gets back the ONE status it should branch on: `denied`,
 * `deleted`, `missing`, `anonymous`, `ok` (the read failed for some other
 * reason), or `error`. No surface has to know about RLS, PostgREST codes, or
 * the four different meanings of a null row.
 *
 * `ok` is the one people forget: it means the caller CAN open the record, so
 * whatever failed was transient. Rendering a denial there would be a fresh lie.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchAccessDeniedContext } from "@/features/access-gate/service/accessDeniedContext";
import type { AccessDeniedContext } from "@/features/access-gate/types";

export interface UseAccessGateResult {
  context: AccessDeniedContext | null;
  status: AccessDeniedContext["status"] | "loading";
  isLoading: boolean;
  /** Re-resolve — used after a request is sent, granted, or withdrawn. */
  refresh: () => void;
}

export function useAccessGate(
  token: string | null | undefined,
  id: string | null | undefined,
  options: { enabled?: boolean } = {},
): UseAccessGateResult {
  const [nonce, setNonce] = useState(0);

  // ONE key identifies "which question is currently being asked". Both the
  // freshness check and the loading state derive from it, so the effect never
  // has to call setState synchronously to reset itself when the target changes
  // (that pattern cascades renders — react-hooks/set-state-in-effect).
  const enabled = options.enabled !== false && Boolean(token && id);
  const key = enabled ? `${token}:${id}:${nonce}` : null;

  const [resolved, setResolved] = useState<{
    key: string;
    context: AccessDeniedContext;
  } | null>(null);

  useEffect(() => {
    if (!key || !token || !id) return;

    // An answer must never be applied to a different record — the user can
    // navigate between two denied ids faster than the RPC returns.
    let active = true;
    void fetchAccessDeniedContext(token, id).then((next) => {
      if (active) setResolved({ key, context: next });
    });
    return () => {
      active = false;
    };
  }, [key, token, id]);

  // Stale answers are discarded by comparing keys, not by clearing state.
  const context = resolved && resolved.key === key ? resolved.context : null;
  const isLoading = key !== null && context === null;

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return {
    context,
    status: isLoading ? "loading" : (context?.status ?? "error"),
    isLoading,
    refresh,
  };
}
