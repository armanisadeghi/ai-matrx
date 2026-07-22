/**
 * The store behind universal stream capture.
 *
 * Deliberately NOT Redux. The tap installs before hydration (so a stream that
 * starts during boot is still recorded) and must keep working if the store is
 * torn down or never mounts on a given route. React reads it through
 * `useCapturedStreams`, which subscribes to the notifier below.
 *
 * Held on `globalThis` so an HMR reload reuses the same buffer instead of
 * silently starting a second one.
 */

import {
  CAPTURE_LIMITS,
  type CapturedStream,
  type CapturedStreamEvent,
  type CapturedStreamStatus,
} from "./types";

interface RecorderState {
  streams: Map<string, CapturedStream>;
  listeners: Set<() => void>;
  seq: number;
  /** Bumped on every mutation so `useSyncExternalStore` can cheap-compare. */
  version: number;
}

const GLOBAL_KEY = "__matrxStreamCapture" as const;

function getState(): RecorderState {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: RecorderState;
  };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      streams: new Map(),
      listeners: new Set(),
      seq: 0,
      version: 0,
    };
  }
  return g[GLOBAL_KEY];
}

/**
 * Notification is coalesced to one microtask-batched flush. A stream can emit
 * hundreds of events per second; waking React per event would make the debug
 * facility itself the performance problem it exists to diagnose.
 */
let flushScheduled = false;
function notify(): void {
  const state = getState();
  state.version++;
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    for (const listener of state.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("[stream-capture] listener threw", err);
      }
    }
  });
}

export function beginStream(init: {
  url: string;
  method: string;
  requestId: string | null;
  conversationId: string | null;
  httpStatus: number;
}): string {
  const state = getState();
  const id = `stream_${++state.seq}_${init.requestId ?? "anon"}`;

  state.streams.set(id, {
    id,
    url: init.url,
    method: init.method,
    requestId: init.requestId,
    conversationId: init.conversationId,
    httpStatus: init.httpStatus,
    startedAt: Date.now(),
    endedAt: null,
    status: "open",
    error: null,
    events: [],
    bytes: 0,
    truncated: false,
  });

  // Evict oldest streams beyond the cap. Map preserves insertion order.
  while (state.streams.size > CAPTURE_LIMITS.maxStreams) {
    const oldest = state.streams.keys().next();
    if (oldest.done) break;
    state.streams.delete(oldest.value);
  }

  notify();
  return id;
}

export function recordEvent(
  streamId: string,
  event: Omit<CapturedStreamEvent, "idx">,
): void {
  const stream = getState().streams.get(streamId);
  if (!stream) return;

  stream.events.push({ ...event, idx: stream.events.length });

  if (stream.events.length > CAPTURE_LIMITS.maxEventsPerStream) {
    // Drop from the front, but keep `idx` as the true wire position so a
    // truncated record still tells you exactly which events you are missing.
    stream.events.splice(
      0,
      stream.events.length - CAPTURE_LIMITS.maxEventsPerStream,
    );
    stream.truncated = true;
  }

  notify();
}

export function recordBytes(streamId: string, count: number): void {
  const stream = getState().streams.get(streamId);
  if (!stream) return;
  stream.bytes += count;
}

export function endStream(
  streamId: string,
  status: Exclude<CapturedStreamStatus, "open">,
  error?: string,
): void {
  const stream = getState().streams.get(streamId);
  if (!stream) return;
  stream.status = status;
  stream.endedAt = Date.now();
  stream.error = error ?? null;
  notify();
}

// ── Read side ──────────────────────────────────────────────────────────────

/** Newest first — the order every debug surface wants. */
export function getCapturedStreams(): CapturedStream[] {
  return Array.from(getState().streams.values()).reverse();
}

export function getCapturedStream(id: string): CapturedStream | undefined {
  return getState().streams.get(id);
}

export function getCaptureVersion(): number {
  return getState().version;
}

export function subscribeToCapture(listener: () => void): () => void {
  const state = getState();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function clearCapturedStreams(): void {
  getState().streams.clear();
  notify();
}
