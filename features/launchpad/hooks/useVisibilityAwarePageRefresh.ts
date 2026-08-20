"use client";

import { useEffect } from "react";
import {
  LAUNCHPAD_EDITING_RETRY_MS,
  LAUNCHPAD_REFRESH_INTERVAL_MS,
} from "../constants";

/**
 * Reloads a long-lived launcher once it becomes stale, without interrupting a
 * hidden tab or a person who is actively typing into a form control.
 */
export function useVisibilityAwarePageRefresh({
  refreshAfterMs = LAUNCHPAD_REFRESH_INTERVAL_MS,
  editingRetryMs = LAUNCHPAD_EDITING_RETRY_MS,
}: {
  refreshAfterMs?: number;
  editingRetryMs?: number;
} = {}): void {
  useEffect(() => {
    let refreshDue = false;
    let retryTimer: number | undefined;

    const refreshWhenSafe = () => {
      if (document.visibilityState !== "visible") {
        refreshDue = true;
        return;
      }
      refreshDue = false;

      const activeElement = document.activeElement;
      const isEditing =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement;

      if (isEditing) {
        retryTimer = window.setTimeout(refreshWhenSafe, editingRetryMs);
        return;
      }

      window.location.reload();
    };

    const refreshTimer = window.setTimeout(refreshWhenSafe, refreshAfterMs);
    const handleVisibilityChange = () => {
      if (refreshDue && document.visibilityState === "visible") {
        refreshWhenSafe();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearTimeout(refreshTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [editingRetryMs, refreshAfterMs]);
}
