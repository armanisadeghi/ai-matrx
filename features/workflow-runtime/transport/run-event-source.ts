/**
 * Run event source — the SSE + poller transport pair on ONE shared cursor.
 *
 * Framework-free port of workflow-studio's `use-run-event-stream.ts` +
 * `use-canvas-run-poller.ts` logic (no React, no Redux) so any consumer —
 * Redux thunk, test, worker — can drive it.
 *
 * Transport policy:
 * - SSE (`GET {baseUrl}/runs/{id}/events/stream`) is the preferred wire, but
 *   it must EARN it: claim-on-first-frame. The poller keeps running until a
 *   parsed frame proves the transport + parser end-to-end; only then does
 *   the SSE path claim the wire and the poller stand down. A dead-but-open
 *   connection must never demote the fallback.
 * - Stall detector: the server pings every 15s, so a connection silent for
 *   STALL_TIMEOUT_MS (20s) is dead, not idle — abort it, demote to polling,
 *   and retry SSE.
 * - Any SSE error demotes to polling IMMEDIATELY (never wait out the retry
 *   budget with neither transport delivering); SSE retries up to
 *   RECONNECT_LIMIT times, then the poller owns delivery for good.
 * - document.hidden aborts the SSE fetch (browsers throttle background
 *   streams hard); polling continues. Guarded for non-DOM environments.
 * - Both transports advance the SAME per-run `seq` cursor (monotonic, never
 *   regresses), so a handoff in either direction resumes exactly.
 * - Ephemeral `node_stream` frames arrive on SSE only, carry NO id, and are
 *   forwarded with seq null WITHOUT advancing the cursor — they are never
 *   replayed and never come through the poller (durable rows only).
 * - The server's `end` frame is terminal: onEnd fires and both transports
 *   stop.
 */

import { streamSse } from "@/features/workflow-runtime/transport/sse";
import { isNodeStreamEvent, isWorkflowRunEvent } from "@/features/workflow-runtime/types";
import type {
  NodeStreamEvent,
  RunEventRecord,
  WorkflowRunEvent,
} from "@/features/workflow-runtime/types";

export type RunTransportMode = "sse" | "polling" | "idle";

export interface RunEventSourceConfig {
  runId: string;
  /** API origin, no trailing slash. */
  baseUrl: string;
  /** Fresh auth headers per (re)connect — a token refresh must reach reconnects. */
  getHeaders: () => Record<string, string>;
  /** Resume from this durable seq (e.g. after hydrating history). */
  initialCursor?: number | null;
  /** Injected GET helper — receives the full URL, returns parsed JSON. */
  fetchJson: <T>(path: string) => Promise<T>;
  onEvent: (event: WorkflowRunEvent | NodeStreamEvent, seq: number | null) => void;
  onMode?: (mode: RunTransportMode) => void;
  /** Server `end` frame received — the run is terminal; both transports stopped. */
  onEnd?: () => void;
}

const RECONNECT_LIMIT = 3;
const RECONNECT_DELAY_MS = 2_000;
/**
 * Must sit ABOVE the server's 15s SSE ping interval — fires only when even
 * pings stop, never on an idle-but-healthy stream.
 */
const STALL_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 2_000;
const POLL_LIMIT = 200;

export function startRunEventSource(config: RunEventSourceConfig): {
  stop: () => void;
  getCursor: () => number | null;
} {
  const { runId, baseUrl, getHeaders, fetchJson, onEvent, onMode, onEnd } = config;

  let stopped = false;
  /** THE one cursor — both transports advance it, neither may regress it. */
  let cursor: number | null = config.initialCursor ?? null;
  let mode: RunTransportMode = "idle";
  let sseErrors = 0;
  let sseGaveUp = false;
  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInFlight = false;

  const setMode = (next: RunTransportMode): void => {
    if (mode === next) return;
    mode = next;
    onMode?.(next);
  };

  const advanceCursor = (seq: number): void => {
    if (cursor === null || seq > cursor) cursor = seq;
  };

  const isHidden = (): boolean =>
    typeof document !== "undefined" && document.visibilityState === "hidden";

  const clearStallTimer = (): void => {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

  /**
   * Re-armed on every parsed frame (comment pings included). Fires only on
   * an open-but-silent connection — aborting makes streamSse reject, and
   * the catch path demotes to polling + schedules a reconnect.
   */
  const armStallTimer = (): void => {
    clearStallTimer();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (stopped) return;
      // Claimed or not, a silent wire past the ping interval is dead —
      // abort; the catch path demotes to polling and retries.
      controller?.abort();
    }, STALL_TIMEOUT_MS);
  };

  const stopAll = (): void => {
    if (stopped) return;
    stopped = true;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    if (pollTimer !== null) clearTimeout(pollTimer);
    clearStallTimer();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
    controller?.abort();
    setMode("idle");
  };

  // ------------------------------------------------------------------ SSE

  const handleSseEvent = (eventType: string, data: string, id: string | null): void => {
    if (stopped) return;
    if (eventType === "end") {
      // Terminal: the server has said everything it will ever say.
      onEnd?.();
      stopAll();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return; // malformed frame — ignore
    }
    if (isNodeStreamEvent(parsed)) {
      // Ephemeral live-token frame: no SSE id, never persisted, never
      // replayed. Forward with seq null and do NOT advance the cursor —
      // the Last-Event-ID cursor stays pinned to the durable seq stream.
      onEvent(parsed, null);
      return;
    }
    if (isWorkflowRunEvent(parsed)) {
      const asSeq = id !== null ? Number(id) : Number.NaN;
      const seq = Number.isInteger(asSeq) && asSeq > 0 ? asSeq : null;
      onEvent(parsed, seq);
      if (seq !== null) advanceCursor(seq);
    }
  };

  const connectSse = async (): Promise<void> => {
    if (stopped || sseGaveUp) return;
    if (isHidden()) {
      // Backgrounded tabs throttle fetch streams hard — the poller carries
      // delivery until the tab returns (visibilitychange reconnects).
      setMode("polling");
      armPoller();
      return;
    }
    controller = new AbortController();
    // Do NOT claim 'sse' yet — the poller stands down only once a parsed
    // frame proves the wire (claim-on-first-frame in onFrame below).
    armStallTimer();
    try {
      await streamSse(`${baseUrl}/runs/${runId}/events/stream`, handleSseEvent, {
        headers: getHeaders(),
        lastEventId: cursor !== null ? String(cursor) : null,
        signal: controller.signal,
        onFrame: () => {
          // First frame proves transport + parser end-to-end; only then
          // does SSE claim the wire so the poller can back off.
          sseErrors = 0;
          if (mode !== "sse") {
            setMode("sse");
            if (pollTimer !== null) {
              clearTimeout(pollTimer);
              pollTimer = null;
            }
          }
          armStallTimer();
        },
      });
      clearStallTimer();
      if (stopped) return;
      // Clean close without an explicit `end` frame (e.g. run already
      // terminal server-side, or an idle stream recycled). The poller
      // resumes delivery from the shared cursor.
      setMode("polling");
      armPoller();
    } catch {
      clearStallTimer();
      if (stopped) return;
      // Hand the wire to the poller IMMEDIATELY — never leave a window
      // where neither transport delivers.
      setMode("polling");
      armPoller();
      sseErrors += 1;
      if (sseErrors >= RECONNECT_LIMIT) {
        sseGaveUp = true; // poller owns delivery for the rest of this run
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connectSse();
      }, RECONNECT_DELAY_MS);
    }
  };

  // --------------------------------------------------------------- Poller

  const armPoller = (): void => {
    if (stopped || pollTimer !== null || pollInFlight) return;
    if (mode === "sse") return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void pollOnce();
    }, POLL_INTERVAL_MS);
  };

  const pollOnce = async (): Promise<void> => {
    if (stopped) return;
    // SSE reclaimed the wire — stand down; a later demotion re-arms.
    if (mode === "sse") return;
    if (pollInFlight) {
      armPoller();
      return;
    }
    pollInFlight = true;
    try {
      const qs =
        cursor !== null
          ? `?after_seq=${cursor}&limit=${POLL_LIMIT}`
          : `?limit=${POLL_LIMIT}`;
      // PATH-relative: the injected fetchJson prepends the base URL itself
      // (passing a full URL here double-prefixed every poll — Bugbot #147).
      const rows = await fetchJson<RunEventRecord[]>(`/runs/${runId}/events${qs}`);
      if (stopped) return;
      for (const row of rows) {
        // Monotonic cursor guard — defend against duplicate delivery
        // across transports and out-of-order responses.
        if (row.seq !== null && cursor !== null && row.seq <= cursor) continue;
        // The durable row keeps the discriminator on `event_type`; merge it in
        // exactly as the replay path does, or every polled event fails the
        // type guard and the fallback transport applies nothing.
        const payload: unknown = { ...row.payload, event: row.event_type };
        // Durable rows only ever hold the 19 workflow events; node_stream
        // is never persisted, so no ephemeral branch exists here.
        if (isWorkflowRunEvent(payload)) {
          onEvent(payload, row.seq);
          if (row.seq !== null) advanceCursor(row.seq);
        }
      }
    } catch {
      // Transient poll failure — the next tick retries.
    } finally {
      pollInFlight = false;
    }
    // armPoller re-checks stopped + mode itself — SSE may have claimed the
    // wire while this poll's fetch was in flight.
    armPoller();
  };

  // ----------------------------------------------------------- Visibility

  const onVisibility = (): void => {
    if (stopped) return;
    if (isHidden()) {
      // Abort the throttled background stream; polling continues.
      controller?.abort();
      setMode("polling");
      armPoller();
    } else if (!sseGaveUp && (controller === null || controller.signal.aborted)) {
      sseErrors = 0;
      void connectSse();
    }
  };

  // ------------------------------------------------------------- Start-up

  setMode("polling");
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  // Poller starts immediately (claim-on-first-frame: it carries delivery
  // until SSE proves itself) — first poll now, SSE handshake in parallel.
  void pollOnce();
  void connectSse();

  return {
    stop: stopAll,
    getCursor: () => cursor,
  };
}
