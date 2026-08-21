"use client";

/**
 * useScreenshotSession — the bounded "show me what's happening" state (D-8/D-21).
 *
 * An explicit, user-initiated request that captures stills while open, auto-offs
 * after 5 minutes without interaction, and is always re-armable. There is a
 * visible way out at all times; this is never an ambient feed.
 *
 * Captures are EVENT-DRIVEN first (Arman 2026-08-21): the chat stream stamps
 * `browserActivityAt` whenever a cloud-browser tool acts (navigate / click /
 * fill / login), and the session captures immediately (debounced, so a burst of
 * fills is one frame) — the viewer sees the action, not the gaps between timer
 * ticks. The timed cadence is only the idle backstop for quiet pages, and Rapid
 * mode (per-session opt-in) covers pages that animate without tool activity.
 *
 * An open session counts as observation for the idle timer (D-10) — the server
 * learns this because the panel keeps requesting frames while it is active.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  SCREENSHOT_ACTIVITY_DEBOUNCE_MS,
  SCREENSHOT_AUTO_OFF_MS,
  SCREENSHOT_IDLE_CADENCE_MS,
  SCREENSHOT_RAPID_CADENCE_MS,
} from "../constants";
import { requestScreenshot } from "../service";
import {
  pushFrame,
  rearmScreenshotSession,
  startScreenshotSession,
  stopScreenshotSession,
} from "../redux/cloudBrowserSlice";
import { selectBrowserActivityAt, selectScreenshot } from "../redux/selectors";

export function useScreenshotSession(runId: string | null, rapid = false) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectScreenshot);
  const activityAt = useAppSelector(selectBrowserActivityAt);
  const cadenceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityCaptureRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledActivityRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (cadenceRef.current) clearInterval(cadenceRef.current);
    if (autoOffRef.current) clearTimeout(autoOffRef.current);
    if (activityCaptureRef.current) clearTimeout(activityCaptureRef.current);
    cadenceRef.current = null;
    autoOffRef.current = null;
    activityCaptureRef.current = null;
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

  // Idle heartbeat + auto-off, driven entirely from the active flag.
  useEffect(() => {
    clearTimers();
    if (!session.active || !runId) return;
    cadenceRef.current = setInterval(
      () => void capture(),
      rapid ? SCREENSHOT_RAPID_CADENCE_MS : SCREENSHOT_IDLE_CADENCE_MS,
    );
    autoOffRef.current = setTimeout(() => stop(), SCREENSHOT_AUTO_OFF_MS);
    return clearTimers;
  }, [session.active, session.autoOffAt, runId, rapid, capture, clearTimers, stop]);

  // Event-driven capture: browser tool activity → one debounced frame.
  useEffect(() => {
    if (!session.active || !runId || activityAt == null) return;
    if (handledActivityRef.current === activityAt) return;
    handledActivityRef.current = activityAt;
    if (activityCaptureRef.current) clearTimeout(activityCaptureRef.current);
    activityCaptureRef.current = setTimeout(
      () => void capture(),
      SCREENSHOT_ACTIVITY_DEBOUNCE_MS,
    );
  }, [activityAt, session.active, runId, capture]);

  return {
    active: session.active,
    autoOffAt: session.autoOffAt,
    frames: session.frames,
    start,
    stop,
    rearm,
  };
}
