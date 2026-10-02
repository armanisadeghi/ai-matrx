/**
 * Fetch-based SSE client — NOT the native EventSource.
 *
 * EventSource can't set request headers, which would force the JWT into a
 * query param (logged in access logs and against the header-only auth
 * contract). The request goes through the host door (`requestRaw` in
 * `lib/python-client.ts`), which resolves the active server and adds the
 * standard Authorization + organization headers, so the backend's
 * AuthMiddleware authenticates the stream exactly like every other route.
 *
 * Framing is the shared Matrx SSE kernel (`@ai-matrx/agents/stream/sse`):
 * all three separators (sse-starlette emits CRLF), multi-line `data:` joined
 * with "\n", partial frames buffered across chunks.
 *
 * `onFrame` fires for EVERY parsed frame — including comment-only
 * heartbeats (`: ping …`) that never reach `onEvent`. It is the liveness
 * signal for stall detection: a fired `onFrame` proves the connection AND
 * the frame parser both work.
 *
 * Resolves when the stream closes; throws on network error / non-2xx so the
 * caller can fall back to polling.
 */

import { readMatrxSseStream } from "@ai-matrx/agents/stream/sse";
import { requestRaw } from "@/lib/python-client";

export interface SseOptions {
  /**
   * Extra request headers. Authorization and organization headers are added
   * by the host door; Accept is set here.
   */
  headers?: Record<string, string>;
  /** Resume cursor, sent as the `Last-Event-ID` request header. */
  lastEventId?: string | null;
  signal: AbortSignal;
  /** Fires on every parsed frame, comment heartbeats included. */
  onFrame?: () => void;
}

/**
 * @param path Server-relative path (e.g. `/runs/{id}/events/stream`). The
 *   host door prepends the active server's base URL.
 */
export async function streamSse(
  path: string,
  onEvent: (eventType: string, data: string, id: string | null) => void,
  options: SseOptions,
): Promise<void> {
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
    Accept: "text/event-stream",
  };
  delete headers["Content-Type"]; // GET has no body
  if (options.lastEventId) headers["Last-Event-ID"] = options.lastEventId;

  const res = await requestRaw(
    path,
    { method: "GET", headers },
    { signal: options.signal, allowHttpError: true },
  );

  if (!res.ok || !res.body) {
    throw new Error(`SSE request failed: ${res.status} ${res.statusText}`);
  }

  for await (const frame of readMatrxSseStream(res.body)) {
    // Every separated frame — even a comment-only heartbeat — is proof the
    // transport and the parser are alive.
    options.onFrame?.();
    // The server stamps durable frames with the per-run seq in `id:` — the
    // authoritative resume cursor (sent back as Last-Event-ID). Ephemeral
    // node_stream frames deliberately carry NO id.
    if (frame.data !== null) onEvent(frame.event, frame.data, frame.id);
  }
}
