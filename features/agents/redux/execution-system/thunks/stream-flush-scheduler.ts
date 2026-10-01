/**
 * ONE flush clock for every live stream in the tab.
 *
 * Why: the /board canvas mounts 10–15 full pages at once, several of them
 * chats streaming at the same time. Each `processStream` used to own a private
 * 30 ms `setTimeout`, so N streams flushed on N unaligned clocks and every
 * flush dispatched 2–3 actions — each a store notification that re-ran every
 * mounted `useAppSelector` in every page. Now:
 *
 *   1. All streams register their flush here and ONE timer drains them
 *      together, so N streams produce one flush tick, not N.
 *   2. Every hot-path action a flush dispatches is tagged with RTK's
 *      `SHOULD_AUTOBATCH` meta (`autoBatched`). The store's default
 *      `autoBatchEnhancer` (configureStore installs it; `type: "raf"`) then
 *      notifies subscribers ONCE per animation frame for the whole tick
 *      instead of once per action. Reducers still run synchronously — state
 *      is current for `getState()` and every middleware on every action; only
 *      the subscriber wake-up is coalesced. Any untagged action (a tool event,
 *      a status change, the end of the stream) notifies immediately, carrying
 *      the batched state with it.
 *
 * Nothing is dropped: a flush only moves already-buffered text into the
 * store, and a stream's own synchronous `dispatchBatch()` at every structural
 * boundary unschedules it first, so ordering is unchanged.
 */
import { SHOULD_AUTOBATCH } from "@reduxjs/toolkit";

/**
 * ~30 fps. Not rAF's 16 ms on purpose: feeding long markdown to the renderer
 * 60× a second freezes the main thread (the reason the per-stream timer was
 * 30 ms before it was shared).
 */
export const STREAM_FLUSH_INTERVAL_MS = 30;

const scheduled = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function drainScheduledFlushes(): void {
  timer = null;
  const due = Array.from(scheduled);
  scheduled.clear();
  for (const flush of due) {
    try {
      flush();
    } catch (error) {
      // One stream's failure must never starve the others of their flush —
      // but it must still surface exactly as it did when each stream owned
      // its own timer (an uncaught error), never be swallowed.
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}

/** Ask for `flush` to run on the next shared tick. Idempotent per tick. */
export function scheduleStreamFlush(flush: () => void): void {
  scheduled.add(flush);
  if (timer === null) {
    timer = setTimeout(drainScheduledFlushes, STREAM_FLUSH_INTERVAL_MS);
  }
}

/** The stream flushed synchronously (or is done): drop its pending tick. */
export function unscheduleStreamFlush(flush: () => void): void {
  if (!scheduled.delete(flush)) return;
  if (scheduled.size === 0 && timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** How many streams are waiting on the shared tick (tests/diagnostics). */
export function pendingStreamFlushCount(): number {
  return scheduled.size;
}

/**
 * Tag a plain action so the store's `autoBatchEnhancer` coalesces its
 * subscriber notification into the current frame. Thunks and other
 * non-object values pass through untouched.
 */
export function autoBatched<T>(action: T): T {
  if (
    typeof action !== "object" ||
    action === null ||
    !("type" in action) ||
    typeof (action as { type: unknown }).type !== "string"
  ) {
    return action;
  }
  const meta = (action as { meta?: unknown }).meta;
  return {
    ...action,
    meta: {
      ...(typeof meta === "object" && meta !== null ? meta : {}),
      [SHOULD_AUTOBATCH]: true,
    },
  };
}
