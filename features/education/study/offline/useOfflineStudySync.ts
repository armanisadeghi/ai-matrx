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
import { countPendingAttempts } from "./outbox";
import { flushStudyOutbox } from "./replay";

export function useOfflineStudySync(userId: string | null): {
  pending: number;
  syncing: boolean;
  flushNow: () => void;
} {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setPending(await countPendingAttempts(userId));
  }, [userId]);

  const flushNow = useCallback(() => {
    if (!userId) return;
    setSyncing(true);
    void flushStudyOutbox(userId)
      .then(() => refresh())
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

  return { pending, syncing, flushNow };
}
