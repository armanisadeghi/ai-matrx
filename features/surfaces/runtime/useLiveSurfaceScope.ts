"use client";

import { useEffect, useState } from "react";
import { useSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

export type LiveSurfaceScopeStatus =
  | "live"
  | "snapshot"
  | "unavailable"
  | "error";

export interface LiveSurfaceScopeResult {
  scope: Record<string, unknown>;
  status: LiveSurfaceScopeStatus;
  error: string | null;
  lastUpdatedAt: number | null;
  refresh: () => void;
}

const LIVE_SAMPLE_MS = 400;
const EMPTY_SCOPE: Record<string, unknown> = {};

function fingerprint(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return Object.keys(value).sort().join("|");
  }
}

/**
 * Samples the page-owned `SurfaceRuntimeProvider` while a context window is
 * open. The provider's `getScope` callback always reads the latest page state,
 * so this observes Redux/editor changes without copying page state into a
 * second store. A caller-owned snapshot remains the fallback for context-menu
 * inspections and pages that have not registered a runtime yet.
 */
export function useLiveSurfaceScope({
  enabled,
  surfaceName,
  fallbackScope = EMPTY_SCOPE,
  preferRuntime = true,
}: {
  enabled: boolean;
  surfaceName: string | null;
  fallbackScope?: Record<string, unknown>;
  preferRuntime?: boolean;
}): LiveSurfaceScopeResult {
  const runtime = useSurfaceRuntime();
  const [scope, setScope] = useState<Record<string, unknown>>(fallbackScope);
  const [status, setStatus] = useState<LiveSurfaceScopeStatus>(
    Object.keys(fallbackScope).length > 0 ? "snapshot" : "unavailable",
  );
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const runtimeMatches =
    preferRuntime &&
    runtime != null &&
    surfaceName != null &&
    runtime.surfaceName === surfaceName;

  useEffect(() => {
    if (!enabled) return;

    if (!runtimeMatches || !runtime) {
      setScope(fallbackScope);
      setStatus(
        Object.keys(fallbackScope).length > 0 ? "snapshot" : "unavailable",
      );
      setError(null);
      setLastUpdatedAt(null);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let previousFingerprint = fingerprint(fallbackScope);

    const sample = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const next = (await runtime.getScope()) as Record<string, unknown>;
        if (cancelled) return;
        const nextFingerprint = fingerprint(next);
        if (nextFingerprint !== previousFingerprint) {
          previousFingerprint = nextFingerprint;
          setScope(next);
        }
        setStatus("live");
        setError(null);
        setLastUpdatedAt(Date.now());
      } catch (reason) {
        if (cancelled) return;
        setStatus("error");
        setError(
          reason instanceof Error
            ? reason.message
            : "The page could not provide its live surface values.",
        );
      } finally {
        inFlight = false;
      }
    };

    void sample();
    const intervalId = window.setInterval(() => void sample(), LIVE_SAMPLE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    enabled,
    fallbackScope,
    preferRuntime,
    refreshToken,
    runtime,
    runtimeMatches,
    surfaceName,
  ]);

  return {
    scope,
    status,
    error,
    lastUpdatedAt,
    refresh: () => setRefreshToken((current) => current + 1),
  };
}
