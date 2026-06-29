/**
 * features/files/hooks/useStorageQuota.ts
 *
 * Fetch the authenticated user's account tier + current storage usage
 * **directly** via the `get_usage_status` RPC (canonical path — no Python hop).
 * Powers `StorageQuotaChip` in the cloud-files sidebar and any future
 * "tier-blocked" warnings.
 *
 * Refresh strategy:
 *   - One-shot fetch on first mount per session (deliberate — quotas are
 *     generous and the displayed number is informational, not a hard
 *     gate; soft over-quota is handled out-of-band by billing).
 *   - Imperative `refresh()` exposed for callers that genuinely need a
 *     fresh number (e.g. after a large bulk upload).
 *
 * The hook caches the response on `window` (per session) so navigating
 * around doesn't re-fetch. `refresh()` busts the cache.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsAuthenticated,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { getUsageStatusDirect } from "@/features/files/api/direct";
import type { StorageUsageResponse } from "@/features/files/types";
import { extractErrorMessage } from "@/utils/errors";

interface QuotaCache {
  userId: string;
  data: StorageUsageResponse;
}

// Single in-memory cache keyed on user-id. Survives unmount/remount of
// the chip but resets on full page reload (which is the intended
// "once-per-session" granularity).
let quotaCache: QuotaCache | null = null;

export interface UseStorageQuotaOptions {
  /**
   * If false, the hook won't fetch — useful when the host component
   * isn't visible yet (e.g. inside a collapsed pane).
   */
  enabled?: boolean;
}

export interface QuotaSummary {
  /** Bytes consumed by the user's files. */
  bytesUsed: number;
  /**
   * Tier cap in bytes, or `null` if the user is on an "unlimited"
   * tier — UIs should show "X used" without a percentage in that case.
   */
  maxBytes: number | null;
  /** 0..1, or `null` when `maxBytes` is null. */
  fraction: number | null;
  /** 0..100 (rounded), or `null` when `maxBytes` is null. */
  percent: number | null;
  /** True when the account is hard-blocked by the tier (read-only). */
  isBlocked: boolean;
  /** Server-supplied reason string, when `isBlocked`. */
  blockedReason: string | null;
  /** Human-readable tier name (e.g. "Free", "Pro"). */
  tierName: string;
  /** Severity buckets driven off `fraction`. */
  severity: "ok" | "warning" | "critical" | "blocked";
}

export interface UseStorageQuotaResult {
  /** Raw response from `/files/usage`, or null until first load. */
  data: StorageUsageResponse | null;
  /** Pre-computed summary for chip / banner UIs. */
  summary: QuotaSummary | null;
  loading: boolean;
  error: string | null;
  /** Imperative refresh — call after uploads / deletes / restore. */
  refresh: () => Promise<void>;
}

function summarize(data: StorageUsageResponse): QuotaSummary {
  const { bytes_used, max_storage_bytes, is_blocked, blocked_reason } = data;
  const fraction =
    max_storage_bytes && max_storage_bytes > 0
      ? Math.min(bytes_used / max_storage_bytes, 1)
      : null;
  const percent = fraction === null ? null : Math.round(fraction * 100);
  let severity: QuotaSummary["severity"];
  if (is_blocked) severity = "blocked";
  else if (fraction === null) severity = "ok";
  else if (fraction >= 0.95) severity = "critical";
  else if (fraction >= 0.8) severity = "warning";
  else severity = "ok";
  return {
    bytesUsed: bytes_used,
    maxBytes: max_storage_bytes,
    fraction,
    percent,
    isBlocked: is_blocked,
    blockedReason: blocked_reason,
    tierName: data.tier_name,
    severity,
  };
}

export function useStorageQuota(
  options: UseStorageQuotaOptions = {},
): UseStorageQuotaResult {
  const { enabled = true } = options;
  const userId = useAppSelector(selectUserId);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const authReady = useAppSelector(selectAuthReady);
  const active = enabled && authReady && isAuthenticated && !!userId;

  const cachedForUser =
    userId && quotaCache?.userId === userId ? quotaCache.data : null;
  const [data, setData] = useState<StorageUsageResponse | null>(cachedForUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  const fetchOnce = useCallback(
    async (force: boolean) => {
      if (!active || !userId) return;
      if (!force && quotaCache?.userId === userId) {
        setData(quotaCache.data);
        return;
      }
      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const resp = await getUsageStatusDirect(userId, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        quotaCache = { userId, data: resp };
        setData(resp);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(extractErrorMessage(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
        if (inFlightRef.current === controller) inFlightRef.current = null;
      }
    },
    [active, userId],
  );

  const refresh = useCallback(() => fetchOnce(true), [fetchOnce]);

  useEffect(() => {
    if (!active) {
      setData(null);
      setError(null);
      return undefined;
    }
    void fetchOnce(false);
    return () => {
      inFlightRef.current?.abort();
    };
  }, [active, fetchOnce]);

  return {
    data,
    summary: data ? summarize(data) : null,
    loading,
    error,
    refresh,
  };
}
