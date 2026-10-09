// lib/boot/lateIdle.ts — THE LATE TIER.
//
// The page paints, the shell's idle work flushes (`@ai-matrx/kit/idle-scheduler`), and only THEN,
// a few seconds later, the informational reads that nobody is waiting for (assists, "needs you",
// suggestion toasts, analytics, auth re-reads). One helper so every late read waits the same way;
// never hand-roll a per-call-site setTimeout after load.
"use client";

import { useEffect, useState } from "react";
import { whenPageIdle } from "@ai-matrx/kit/idle-scheduler";

/** Seconds after the idle flush before late reads start. */
export const LATE_IDLE_DELAY_MS = 6_000;

/**
 * Resolves `delayMs` after the page's idle flush. Returns false when aborted first.
 * Server: resolves false immediately (there is no page to wait for).
 */
export async function whenLateIdle(delayMs = LATE_IDLE_DELAY_MS, signal?: AbortSignal): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const idle = await whenPageIdle(signal);
  if (!idle || signal?.aborted) return false;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(!signal?.aborted), delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve(false);
      },
      { once: true },
    );
  });
}

/** `true` once the late tier has opened. One re-render: false → true. */
export function useLateIdleReady(delayMs = LATE_IDLE_DELAY_MS): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const controller = new AbortController();
    void whenLateIdle(delayMs, controller.signal).then((ok) => {
      if (ok) setReady(true);
    });
    return () => controller.abort();
  }, [ready, delayMs]);
  return ready;
}
