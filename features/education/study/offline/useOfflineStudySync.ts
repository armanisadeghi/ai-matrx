"use client";

/**
 * Drains the offline study outbox when the device comes back, and exposes the
 * queue depth so a surface can tell the learner "3 answers waiting to sync"
 * instead of leaving them wondering whether their work survived.
 *
 * Flush triggers: mount (a reload after studying offline), the `online` event,
 * and tab refocus (phones fire `visibilitychange` far more reliably than
 * `online` when a user walks back into signal).
 *
 * This is also the ONE place that owns a Redux store AND drives the flush, so
 * it is where the pending-grade resolver is built and injected — the spoken
 * answers held back offline are uploaded and graded from here. `replay.ts`
 * itself stays free of Redux and file handling; see `resolvePendingGrade.ts`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { countPendingAttempts } from "./outbox";
import { createPendingGradeResolver } from "./resolvePendingGrade";
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
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const resolveGrade = useMemo(
    () => createPendingGradeResolver(dispatch, store.getState),
    [dispatch, store],
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    setPending(await countPendingAttempts(userId));
  }, [userId]);

  const flushNow = useCallback(() => {
    if (!userId) return;
    setSyncing(true);
    void flushStudyOutbox(userId, resolveGrade)
      .then((report) => {
        // A halted flush used to be swallowed here: the learner pressed "Sync
        // now", the spinner turned, the count did not move, and nothing said
        // why. "offline" is an expected state, not an error worth shouting.
        setLastError(
          report.halted && report.haltReason !== "offline"
            ? report.haltReason
            : null,
        );
        // The spoken answers we held back have now landed. Say which way they
        // went: a grade the learner never saw during the drill is worth
        // pointing at, and an answer that reached us WITHOUT one must not be
        // quietly folded into the same "synced" as the rest.
        if (report.graded > 0) {
          toast.success(
            report.graded === 1
              ? "Your offline recording was uploaded and graded."
              : `${report.graded} offline recordings were uploaded and graded.`,
          );
        }
        if (report.ungraded > 0) {
          toast.warning(
            report.ungraded === 1
              ? "One offline answer was saved but couldn't be graded."
              : `${report.ungraded} offline answers were saved but couldn't be graded.`,
          );
        }
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
  }, [userId, refresh, resolveGrade]);

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
