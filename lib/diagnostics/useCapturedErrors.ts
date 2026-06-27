"use client";

/**
 * React bindings for `errorCaptureStore`. Kept in a separate module so the
 * store + the Supabase capture proxy stay React-free (they're imported by the
 * supabase client, which the whole app depends on).
 */

import { useSyncExternalStore } from "react";
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  getStatsSnapshot,
  type CapturedError,
  type CapturedErrorStats,
} from "@/lib/diagnostics/errorCaptureStore";

/** Live, newest-first list of captured errors. */
export function useCapturedErrors(): CapturedError[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const EMPTY_STATS: CapturedErrorStats = {
  total: 0,
  occurrences: 0,
  unseen: 0,
};

/** Live counts for the badge: { total, occurrences, unseen }. */
export function useCapturedErrorStats(): CapturedErrorStats {
  return useSyncExternalStore(
    subscribe,
    getStatsSnapshot,
    () => EMPTY_STATS,
  );
}
