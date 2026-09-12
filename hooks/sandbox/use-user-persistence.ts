"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SandboxTier,
  UserPersistenceInfo,
  UserPersistenceResponse,
} from "@/types/sandbox";

interface UseUserPersistenceState {
  info: UserPersistenceResponse | null;
  loading: boolean;
  error: string | null;
}

export interface UseUserPersistenceResult extends UseUserPersistenceState {
  /** Re-fetch all tiers (or a single tier when `tier` is given). */
  refresh: (tier?: SandboxTier) => Promise<void>;
  /**
   * Delete the persistent storage for the given tier (or every tier when
   * omitted). Resolves to `{ ok }`; on `false`, `error` is populated. The
   * orchestrator refuses to wipe a volume that's still mounted by an active
   * sandbox — callers should stop their sandboxes first.
   */
  deleteVolume: (tier?: SandboxTier) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Per-user sandbox persistence: how big is the user's `/home/agent` and how
 * many sandboxes are referencing it. Talks to `GET /api/sandbox/persistence`,
 * which fans out to each orchestrator the deployment knows about.
 *
 * Backed by Phase 1+2+3 of the persistence plan — the Python-team-shipped
 * per-user Docker volume on hosted, and the existing S3 prefix on EC2.
 *
 * The hook fetches once on mount, then exposes `refresh()` for the caller to
 * re-poll explicitly (e.g. after creating/destroying a sandbox, or after
 * deleting the volume itself).
 */
export function useUserPersistence(
  options: {
    /** Skip the initial fetch. Useful when the parent only wants to poll
     *  conditionally, e.g. after a tier picker changes. */
    skip?: boolean;
    /** Fetch a single tier instead of every configured tier. */
    tier?: SandboxTier;
  } = {},
): UseUserPersistenceResult {
  const { skip = false, tier } = options;
  const [state, setState] = useState<UseUserPersistenceState>({
    info: null,
    loading: !skip,
    error: null,
  });

  // Race-guard so a fast user toggle doesn't paint stale data.
  const reqIdRef = useRef(0);

  const fetchOnce = useCallback(
    async (overrideTier?: SandboxTier) => {
      const reqId = ++reqIdRef.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const qs = overrideTier ? `?tier=${overrideTier}` : tier ? `?tier=${tier}` : "";
        const resp = await fetch(`/api/sandbox/persistence${qs}`, {
          cache: "no-store",
        });
        if (!resp.ok) {
          throw new Error(
            `Persistence query failed (${resp.status}): ${await resp
              .text()
              .catch(() => resp.statusText)}`,
          );
        }
        const data = (await resp.json()) as UserPersistenceResponse;
        if (reqId !== reqIdRef.current) return; // superseded
        setState({ info: data, loading: false, error: null });
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        setState({
          info: null,
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [tier],
  );

  useEffect(() => {
    if (skip) return;
    void fetchOnce();
  }, [skip, fetchOnce]);

  const deleteVolume = useCallback(
    async (
      deleteTier?: SandboxTier,
    ): Promise<{ ok: boolean; error?: string }> => {
      const qs = deleteTier ? `?tier=${deleteTier}` : "";
      try {
        const resp = await fetch(`/api/sandbox/persistence${qs}`, {
          method: "DELETE",
        });
        const body = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          results?: Array<{
            tier: SandboxTier;
            ok: boolean;
            status: number;
            error?: string;
          }>;
        };
        if (!resp.ok || !body.ok) {
          const failed = body.results?.find((r) => !r.ok);
          const message =
            failed?.error ??
            (resp.status === 409
              ? "Volume in use by an active sandbox — stop it first."
              : `Delete failed (${resp.status})`);
          setState((s) => ({ ...s, error: message }));
          return { ok: false, error: message };
        }
        // Reflect the wipe locally before the next fetch returns.
        setState((s) =>
          s.info
            ? {
                ...s,
                info: {
                  ...s.info,
                  total_size_bytes: deleteTier
                    ? s.info.tiers
                        .filter((t) => t.tier !== deleteTier)
                        .reduce(
                          (sum, t) => sum + (t.current_size_bytes ?? 0),
                          0,
                        )
                    : 0,
                  tiers: deleteTier
                    ? s.info.tiers.map((t) =>
                        t.tier === deleteTier
                          ? { ...t, current_size_bytes: 0, sandbox_count: 0 }
                          : t,
                      )
                    : s.info.tiers.map((t) => ({
                        ...t,
                        current_size_bytes: 0,
                        sandbox_count: 0,
                      })),
                },
              }
            : s,
        );
        await fetchOnce(deleteTier);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setState((s) => ({ ...s, error: message }));
        return { ok: false, error: message };
      }
    },
    [fetchOnce],
  );

  return { ...state, refresh: fetchOnce, deleteVolume };
}

/** Pluck the entry for a single tier — convenience for create dialogs. */
export function findTierInfo(
  info: UserPersistenceResponse | null,
  tier: SandboxTier,
): UserPersistenceInfo | null {
  return info?.tiers.find((t) => t.tier === tier) ?? null;
}
