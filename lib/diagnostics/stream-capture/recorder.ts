/**
 * The store behind universal exchange capture.
 *
 * Deliberately NOT Redux. The tap installs before hydration (so a request made
 * during boot is still recorded) and must keep working if the store is torn
 * down or never mounts on a given route. React reads it through
 * `useCapturedExchanges`, which subscribes to the notifier below.
 *
 * Held on `globalThis` so an HMR reload reuses the same buffer instead of
 * silently starting a second one.
 *
 * COST CONTROL: capture runs in `minimal` mode by default — a 3-exchange
 * rolling window that can never accumulate. `full` mode is opt-in and
 * admin-gated (see `capture-mode.ts`); switching to it is the only way to get
 * deep retention, and switching back immediately re-applies the tight caps.
 */

import {
  CAPTURE_LIMITS,
  type CaptureMode,
  type CapturedExchange,
  type CapturedExchangeStatus,
  type CapturedStreamEvent,
} from "./types";

interface RecorderState {
  exchanges: Map<string, CapturedExchange>;
  listeners: Set<() => void>;
  seq: number;
  mode: CaptureMode;
  /** Bumped on every mutation so `useSyncExternalStore` can cheap-compare. */
  version: number;
  /**
   * Memoized newest-first list, invalidated on every mutation.
   *
   * This exists so `getSnapshot` can return a REFERENCE that is stable between
   * mutations and new after one. Returning a freshly-built array each call
   * would loop forever on reference inequality; deriving the array in the
   * component from a version counter is worse still, because the React
   * Compiler sees a dependency-free call and memoizes it permanently — which
   * is exactly how this panel first shipped reading an empty list while the
   * buffer held data.
   */
  cachedList: CapturedExchange[] | null;
}

const GLOBAL_KEY = "__matrxCapture" as const;

function getState(): RecorderState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: RecorderState };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      exchanges: new Map(),
      listeners: new Set(),
      seq: 0,
      mode: "minimal",
      version: 0,
      cachedList: null,
    };
  }
  return g[GLOBAL_KEY];
}

function limits() {
  return CAPTURE_LIMITS[getState().mode];
}

/**
 * Notification is coalesced to one microtask-batched flush. A stream can emit
 * hundreds of events per second; waking React per event would make the debug
 * facility the performance problem it exists to diagnose.
 */
let flushScheduled = false;
function notify(): void {
  const state = getState();
  state.version++;
  state.cachedList = null;
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    for (const listener of state.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("[capture] listener threw", err);
      }
    }
  });
}

/** Trim the exchange map to the active mode's cap, oldest first. */
function evict(): void {
  const state = getState();
  const max = limits().maxExchanges;
  while (state.exchanges.size > max) {
    const oldest = state.exchanges.keys().next();
    if (oldest.done) break;
    state.exchanges.delete(oldest.value);
  }
}

// ── Mode ───────────────────────────────────────────────────────────────────

export function getCaptureMode(): CaptureMode {
  return getState().mode;
}

/**
 * Switch retention depth. Dropping to `minimal` immediately evicts down to the
 * tight cap so turning the feature off actually reclaims the memory rather
 * than merely stopping growth.
 */
export function setCaptureMode(mode: CaptureMode): void {
  const state = getState();
  if (state.mode === mode) return;
  state.mode = mode;
  if (mode === "minimal") {
    evict();
    for (const exchange of state.exchanges.values()) {
      const max = CAPTURE_LIMITS.minimal.maxEventsPerExchange;
      if (exchange.events.length > max) {
        exchange.events.splice(0, exchange.events.length - max);
        exchange.truncated = true;
      }
    }
  }
  notify();
}

// ── Write side ─────────────────────────────────────────────────────────────

export function beginExchange(init: {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  requestBodyTruncated: boolean;
  transport?: "http" | "websocket";
}): string {
  const state = getState();
  const id = `xchg_${++state.seq}`;

  state.exchanges.set(id, {
    id,
    url: init.url,
    method: init.method,
    requestHeaders: init.requestHeaders,
    requestBody: init.requestBody,
    requestBodyTruncated: init.requestBodyTruncated,
    httpStatus: 0,
    statusText: "",
    responseHeaders: {},
    requestId: null,
    conversationId: null,
    transport: init.transport ?? "http",
    isStream: init.transport === "websocket",
    events: [],
    responseBody: null,
    responseBodyTruncated: false,
    startedAt: Date.now(),
    endedAt: null,
    status: "open",
    error: null,
    bytes: 0,
    truncated: false,
    mode: state.mode,
  });

  evict();
  notify();
  return id;
}

/** Attach the response side once headers are available. */
export function attachResponse(
  id: string,
  init: {
    httpStatus: number;
    statusText: string;
    responseHeaders: Record<string, string>;
    requestId: string | null;
    conversationId: string | null;
    isStream: boolean;
  },
): void {
  const exchange = getState().exchanges.get(id);
  if (!exchange) return;
  Object.assign(exchange, init);
  notify();
}

export function recordEvent(
  id: string,
  event: Omit<CapturedStreamEvent, "idx">,
): void {
  const exchange = getState().exchanges.get(id);
  if (!exchange) return;

  exchange.events.push({ ...event, idx: exchange.events.length });

  const max = limits().maxEventsPerExchange;
  if (exchange.events.length > max) {
    // Drop from the front, but `idx` keeps the true wire position so a
    // truncated record still tells you exactly which events are missing.
    exchange.events.splice(0, exchange.events.length - max);
    exchange.truncated = true;
  }

  notify();
}

export function recordBytes(id: string, count: number): void {
  const exchange = getState().exchanges.get(id);
  if (!exchange) return;
  exchange.bytes += count;
}

export function recordResponseBody(id: string, body: string): void {
  const exchange = getState().exchanges.get(id);
  if (!exchange) return;
  const max = limits().maxBodyChars;
  exchange.responseBody = body.slice(0, max);
  exchange.responseBodyTruncated = body.length > max;
  notify();
}

export function endExchange(
  id: string,
  status: Exclude<CapturedExchangeStatus, "open">,
  error?: string,
): void {
  const exchange = getState().exchanges.get(id);
  if (!exchange) return;
  exchange.status = status;
  exchange.endedAt = Date.now();
  exchange.error = error ?? null;
  notify();
}

// ── Read side ──────────────────────────────────────────────────────────────

/**
 * Newest first — the order every debug surface wants.
 *
 * Reference-stable between mutations so it can be used directly as a
 * `useSyncExternalStore` snapshot.
 */
export function getCapturedExchanges(): CapturedExchange[] {
  const state = getState();
  if (!state.cachedList) {
    state.cachedList = Array.from(state.exchanges.values()).reverse();
  }
  return state.cachedList;
}

export function getCapturedExchange(id: string): CapturedExchange | undefined {
  return getState().exchanges.get(id);
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

export function clearCapturedExchanges(): void {
  getState().exchanges.clear();
  notify();
}
