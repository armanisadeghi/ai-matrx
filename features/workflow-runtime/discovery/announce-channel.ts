/**
 * The run-announce channel — ONE `GET /runs/stream` connection per tab.
 *
 * The server's 0020 triggers NOTIFY on every `workflow.run` INSERT and every
 * real status transition owned by the caller; this endpoint forwards the
 * frames belonging to the authenticated user. It is what makes a runs list and
 * the "waiting on you" inbox live with zero polling.
 *
 * 🚨 **Never Supabase Realtime for this.** `workflow.run` is not in the
 * publication, so a Postgres-Changes subscription against it silently delivers
 * nothing — the failure mode is a list that simply never updates and no error
 * anywhere. This SSE endpoint is the only wire.
 *
 * 🚨 **ONE subscription, N consumers.** The inbox, its header badge, the global
 * runs list and a per-workflow runs list can all be mounted at once; each
 * opening its own SSE connection would be four sockets and four times the
 * server's fan-out for one user's identical frames. `useRunAnnouncements`
 * refcounts a single module-level channel over this function.
 *
 * **Frames are EPHEMERAL** — no SSE `id:`, no `Last-Event-ID`, no replay. A
 * reconnect therefore has a HOLE in it: anything that changed while the wire
 * was down was never queued anywhere. That is why `onStatus("open")` fires on
 * every (re)connection and consumers refetch their snapshot on it — the list
 * fetch is the truth, these frames are upsert hints on top of it.
 *
 * Framework-free by design (no React, no Redux) so the reconnect policy is
 * testable without a renderer.
 */

import { streamSse } from "../transport/sse";
import { isRunAnnounceEvent } from "@/types/python-generated/workflow-events";
import type { RunAnnounceEvent } from "@/types/python-generated/workflow-events";

export type AnnounceChannelStatus = "open" | "closed";

export interface AnnounceChannelConfig {
  /** API origin, no trailing slash. */
  baseUrl: string;
  /** Fresh auth headers per (re)connect — a token refresh must reach reconnects. */
  getHeaders: () => Record<string, string>;
  onAnnounce: (event: RunAnnounceEvent) => void;
  /** "open" on every successful (re)connect; "closed" when the wire drops. */
  onStatus?: (status: AnnounceChannelStatus) => void;
}

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
/**
 * Must sit ABOVE the server's 15s SSE ping — this fires only when even the
 * pings stop, never on a healthy stream that simply has no runs to report.
 * A user can sit on the inbox for an hour with nothing happening; that is the
 * normal case, not a dead connection.
 */
const STALL_TIMEOUT_MS = 20_000;

export interface AnnounceChannel {
  stop: () => void;
}

export function startAnnounceChannel(config: AnnounceChannelConfig): AnnounceChannel {
  const { baseUrl, getHeaders, onAnnounce, onStatus } = config;

  let stopped = false;
  let attempts = 0;
  let status: AnnounceChannelStatus = "closed";
  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (next: AnnounceChannelStatus): void => {
    // "open" always re-fires: each reconnect is a new hole to close, even when
    // the previous state was already open in the consumer's eyes.
    if (status === next && next === "closed") return;
    status = next;
    onStatus?.(next);
  };

  const clearStall = (): void => {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

  const armStall = (): void => {
    clearStall();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (stopped) return;
      // Open but silent past the ping interval means dead, not idle. Aborting
      // makes streamSse reject, and the catch path schedules the reconnect.
      controller?.abort();
    }, STALL_TIMEOUT_MS);
  };

  const isHidden = (): boolean =>
    typeof document !== "undefined" && document.visibilityState === "hidden";

  const handleFrame = (_eventType: string, data: string): void => {
    if (stopped) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return; // malformed frame — ignore
    }
    if (isRunAnnounceEvent(parsed)) onAnnounce(parsed);
  };

  const scheduleReconnect = (): void => {
    if (stopped || reconnectTimer !== null) return;
    // Exponential backoff, capped. Unbounded retries are deliberate: this
    // channel is a page's liveness, and giving up permanently would leave a
    // list quietly stale for the rest of the session with nothing on screen
    // saying so.
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);
    attempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async (): Promise<void> => {
    if (stopped) return;
    if (isHidden()) {
      // Browsers throttle background fetch streams hard. Stay closed until the
      // tab is looked at again; visibilitychange reconnects, and the refetch
      // on "open" closes whatever hole the absence left.
      setStatus("closed");
      return;
    }
    controller = new AbortController();
    armStall();
    try {
      await streamSse(`${baseUrl}/runs/stream`, handleFrame, {
        headers: getHeaders(),
        signal: controller.signal,
        onFrame: () => {
          // A parsed frame — a comment heartbeat included — proves transport
          // and parser end-to-end. Only then is the wire genuinely open.
          attempts = 0;
          setStatus("open");
          armStall();
        },
      });
      clearStall();
      if (stopped) return;
      setStatus("closed");
      scheduleReconnect();
    } catch {
      clearStall();
      if (stopped) return;
      setStatus("closed");
      scheduleReconnect();
    }
  };

  const onVisibility = (): void => {
    if (stopped) return;
    if (isHidden()) {
      controller?.abort();
    } else if (controller === null || controller.signal.aborted) {
      attempts = 0;
      void connect();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  void connect();

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      clearStall();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      controller?.abort();
      status = "closed";
    },
  };
}
