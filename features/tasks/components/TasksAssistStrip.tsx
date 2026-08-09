"use client";

/**
 * TasksAssistStrip — the /tasks route's inline assist chips.
 *
 * Runs the deterministic overdue-pileup sweep (tasks-assists-producer.ts)
 * once per user per browser session over ALREADY-LOADED Redux state (the
 * session-boot task store + per-user snooze state — zero extra reads), then
 * renders this surface's pending assists through the canonical per-page
 * AssistStrip (never a forked chip component). The same rows also appear in
 * the global AssistsDock; deciding a chip in either place clears both —
 * one ledger, one slice.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { isClosedStatus } from "@/features/tasks/constants/status";
import { buildSmartViewContext } from "@/features/tasks/constants/smartViews";
import { selectAllTasksFlat } from "@/features/tasks/redux/selectors";
import {
  selectTaskUserStateLoaded,
  selectTaskUserStateMap,
} from "@/features/tasks/redux/taskUiSlice";
import {
  TASKS_ASSIST_SURFACE,
  produceTaskAssists,
} from "@/features/tasks/tasks-assists-producer";

/** Users whose pileup crossed the threshold this browser session — once the
 * producer has actually run its ledger round-trip there is nothing more to
 * notice until the next session. Below the threshold we deliberately do NOT
 * latch, so tasks that go overdue later in the session are still noticed
 * (the re-checks are pure in-memory — the producer touches no network under
 * the threshold). Module-scoped on purpose. */
const sweptUsers = new Set<string>();

export function TasksAssistStrip({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const tasks = useAppSelector(selectAllTasksFlat);
  const userStateMap = useAppSelector(selectTaskUserStateMap);
  const userStateLoaded = useAppSelector(selectTaskUserStateLoaded);

  useEffect(() => {
    // Snooze state must be loaded first — sweeping before it arrives would
    // count tasks the user has explicitly parked (a false-positive factory).
    if (!userId || !userStateLoaded || tasks.length === 0) return;
    if (sweptUsers.has(userId)) return;

    const { todayStr } = buildSmartViewContext(userId);
    const nowIso = new Date().toISOString();
    const overdue = tasks.filter((t) => {
      if (isClosedStatus(t.status)) return false;
      if (!t.dueDate || t.dueDate >= todayStr) return false;
      const snoozedUntil = userStateMap[t.id]?.snoozedUntil;
      return !snoozedUntil || snoozedUntil <= nowIso;
    });
    // Latch synchronously (no concurrent double-run), un-latch when under
    // threshold so later pileups this session are still noticed.
    sweptUsers.add(userId);
    void produceTaskAssists({ userId, overdue, dispatch }).then(
      (thresholdMet) => {
        if (!thresholdMet) sweptUsers.delete(userId);
      },
    );
  }, [userId, userStateLoaded, tasks, userStateMap, dispatch]);

  return <AssistStrip surfaceName={TASKS_ASSIST_SURFACE} className={className} />;
}
