"use client";

/**
 * useNow — the current time as render input, without calling `Date.now()`
 * during render.
 *
 * WHY THIS IS SHARED, NOT INLINE (THE PLATFORM-PRIMITIVE RULE): React
 * Compiler's purity rule (react-hooks/purity) refuses `Date.now()` in a
 * component body, and every surface that compares a stored expiry against
 * "now" — a mute, a snooze, a lease, a "due in 3 minutes" — needs exactly
 * this. One external store, one ticker, every subscriber re-renders together.
 *
 * Coarse on purpose: the tick is 30 seconds. A surface that needs a finer
 * clock (a countdown) should own its own interval; this hook answers "has
 * the expiry passed yet?" and "how long ago?" at human resolution. Reads on
 * the server return 0, so a mute whose `until` is in the future is treated as
 * live during SSR and settles on the client's first tick.
 */

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

const listeners = new Set<() => void>();
let snapshot = typeof window === "undefined" ? 0 : Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    snapshot = Date.now();
    timer = setInterval(() => {
      snapshot = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
    // A fresh subscriber gets a fresh reading, not the module-load time.
    queueMicrotask(() => {
      for (const l of listeners) l();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return snapshot;
}

function getServerSnapshot(): number {
  return 0;
}

/** Epoch-ms, refreshed every 30 s while any subscriber is mounted; 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Force every subscriber to re-read the clock now (a timer that just fired). */
export function refreshNow(): void {
  snapshot = Date.now();
  for (const l of listeners) l();
}
