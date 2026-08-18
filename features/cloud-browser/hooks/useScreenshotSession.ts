"use client";

/**
 * useScreenshotSession — the bounded "show me what's happening" state (D-8/D-21).
 *
 * An explicit, user-initiated request that captures a fresh still ~every 5s while
 * open, auto-offs after 5 minutes without interaction, and is always re-armable.
 * There is a visible way out at all times; this is never an ambient feed.
 *
 * An open session counts as observation for the idle timer (D-10) — the server
 * learns this because the panel keeps requesting frames while it is active.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SCREENSHOT_AUTO_OFF_MS, SCREENSHOT_CADENCE_MS } from "../constants";
import { requestScreenshot } from "../service";
import {
  pushFrame,
  rearmScreenshotSession,
  startScreenshotSession,
  stopScreenshotSession,
} from "../redux/cloudBrowserSlice";
import { selectScreenshot } from "../redux/selectors";

export function useScreenshotSession(runId: string | null) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectScreenshot);
  const cadenceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (cadenceRef.current) clearInterval(cadenceRef.current);
    if (autoOffRef.current) clearTimeout(autoOffRef.current);
    cadenceRef.current = null;
    autoOffRef.current = null;
  }, []);

  const capture = useCallback(async () => {
    if (!runId) return;
    const frame = await requestScreenshot(runId);
    dispatch(pushFrame(frame));
  }, [dispatch, runId]);

  const stop = useCallback(() => {
    clearTimers();
    dispatch(stopScreenshotSession());
  }, [clearTimers, dispatch]);

  const start = useCallback(() => {
    if (!runId) return;
    dispatch(startScreenshotSession({ autoOffAt: Date.now() + SCREENSHOT_AUTO_OFF_MS }));
    void capture();
  }, [capture, dispatch, runId]);

  /** Re-arm resets the 5-minute clock (interaction / explicit "keep watching"). */
  const rearm = useCallback(() => {
    dispatch(rearmScreenshotSession({ autoOffAt: Date.now() + SCREENSHOT_AUTO_OFF_MS }));
  }, [dispatch]);

  // Drive the cadence + auto-off entirely from the active flag.
  useEffect(() => {
    clearTimers();
    if (!session.active || !runId) return;
    cadenceRef.current = setInterval(() => void capture(), SCREENSHOT_CADENCE_MS);
    autoOffRef.current = setTimeout(() => stop(), SCREENSHOT_AUTO_OFF_MS);
    return clearTimers;
  }, [session.active, session.autoOffAt, runId, capture, clearTimers, stop]);

  return {
    active: session.active,
    autoOffAt: session.autoOffAt,
    frames: session.frames,
    start,
    stop,
    rearm,
  };
}
