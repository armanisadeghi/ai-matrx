"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setNowMinute, currentMinuteIso } from "../redux/taskUiSlice";

/**
 * Ticks `tasksUi.nowMinute` every ~60s while mounted so time-dependent task
 * derivations (snooze expiry, overdue windows, smart-view date buckets)
 * re-evaluate without waiting for an unrelated store change (D129).
 *
 * The reducer no-ops when the minute hasn't changed, so extra dispatches
 * (multiple mounts, tab refocus) are free. Mount once per tasks surface.
 */
export function useNowMinuteTick(): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const tick = () => dispatch(setNowMinute(currentMinuteIso()));
    tick();
    const id = window.setInterval(tick, 60_000);
    // A backgrounded tab throttles intervals — catch up immediately on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dispatch]);
}
