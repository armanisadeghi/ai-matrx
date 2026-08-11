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
  const enabled = options.enabled !== false && Boolean(token && id);
  const [context, setContext] = useState<AccessDeniedContext | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !token || !id) {
      setContext(null);
      setIsLoading(false);
      return;
    }

    // A resolved answer must never be applied to a different record — the user
    // can navigate between two denied ids faster than the RPC returns.
    let active = true;
    setIsLoading(true);

    void fetchAccessDeniedContext(token, id).then((next) => {
      if (!active) return;
      setContext(next);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [enabled, token, id, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return {
    context,
    status: isLoading ? "loading" : (context?.status ?? "error"),
    isLoading,
    refresh,
  };
}
