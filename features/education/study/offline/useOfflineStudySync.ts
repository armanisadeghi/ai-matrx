"use client";

/**
 * Drains the offline study outbox when the device comes back, and exposes the
 * queue depth so a surface can tell the learner "3 answers waiting to sync"
 * instead of leaving them wondering whether their work survived.
 *
 * Flush triggers: mount (a reload after studying offline), the `online` event,
 * and tab refocus (phones fire `visibilitychange` far more reliably than
 * `online` when a user walks back into signal).
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { countPendingAttempts } from "./outbox";
import { flushStudyOutbox } from "./replay";

export function useOfflineStudySync(userId: string | null): {
  pending: number;
  syncing: boolean;
  /** Why the last flush stopped early, or null. Shown, never swallowed. */
  lastError: string | null;
  flushNow: () => void;
} {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setPending(await countPendingAttempts(userId));
  }, [userId]);

  const flushNow = useCallback(() => {
    if (!userId) return;
    setSyncing(true);
    void flushStudyOutbox(userId)
      .then((report) => {
        // A halted flush used to be swallowed here: the learner pressed "Sync
        // now", the spinner turned, the count did not move, and nothing said
        // why. "offline" is an expected state, not an error worth shouting.
        setLastError(
          report.halted && report.haltReason !== "offline"
            ? report.haltReason
            : null,
        );
        // Dead-lettered attempts are LOST ANSWERS. The learner is told.
        if (report.deadLettered.length > 0) {
          toast.error(
            report.deadLettered.length === 1
              ? "One answer could not be saved and was discarded."
              : `${report.deadLettered.length} answers could not be saved and were discarded.`,
          );
        }
        return refresh();
      })
      .finally(() => setSyncing(false));
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    flushNow();

    const onOnline = () => flushNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") flushNow();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, flushNow, refresh]);

  return { pending, syncing, lastError, flushNow };
}
