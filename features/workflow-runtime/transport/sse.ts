/**
 * Fetch-based SSE client — NOT the native EventSource.
 *
 * EventSource can't set request headers, which would force the JWT into a
 * query param (logged in access logs and against the header-only auth
 * contract). fetch sends the standard Authorization header so the backend's
 * AuthMiddleware authenticates the stream exactly like every other route.
 *
 * Parses standard SSE frames (blank-line-delimited `event:` / `data:` /
 * `id:` lines). Frame separators per spec are \n\n, \r\n\r\n, or \r\r —
 * sse-starlette (the backend) emits CRLF, so matching only "\n\n" parses
 * ZERO frames from a real server (a live bug found 2026-07-09 in the
 * studio). Multi-line `data:` values are joined with "\n"; partial frames
 * are buffered across chunks.
 *
 * `onFrame` fires for EVERY parsed frame — including comment-only
 * heartbeats (`: ping …`) that never reach `onEvent`. It is the liveness
 * signal for stall detection: a fired `onFrame` proves the connection AND
 * the frame parser both work.
 *
 * Resolves when the stream closes; throws on network error / non-2xx so the
 * caller can fall back to polling.
 *
 * Framework-free and self-contained by design (no React, no Redux, no
 * lib/api imports) — usable from tests, workers, and the run-event-source
 * transport alike.
 */

export interface SseOptions {
  /** Full request headers — include Authorization; Accept is set here. */
  headers: Record<string, string>;
  /** Resume cursor, sent as the `Last-Event-ID` request header. */
  lastEventId?: string | null;
  signal: AbortSignal;
  /** Fires on every parsed frame, comment heartbeats included. */
  onFrame?: () => void;
}

const FRAME_SEPARATOR = /\r\n\r\n|\n\n|\r\r/;
const LINE_SEPARATOR = /\r\n|\n|\r/;

export async function streamSse(
  url: string,
  onEvent: (eventType: string, data: string, id: string | null) => void,
  options: SseOptions,
): Promise<void> {
  const headers: Record<string, string> = {
    ...options.headers,
    Accept: "text/event-stream",
  };
  delete headers["Content-Type"]; // GET has no body
  if (options.lastEventId) headers["Last-Event-ID"] = options.lastEventId;

  const res = await fetch(url, {
    method: "GET",
    headers,
    signal: options.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`SSE request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: RegExpExecArray | null;
      while ((sep = FRAME_SEPARATOR.exec(buffer)) !== null) {
        const frame = buffer.slice(0, sep.index);
        buffer = buffer.slice(sep.index + sep[0].length);
        // Every separated frame — even a comment-only heartbeat — is proof
        // the transport and the parser are alive.
        options.onFrame?.();
        let eventType = "message";
        let eventId: string | null = null;
        const dataLines: string[] = [];
        for (const line of frame.split(LINE_SEPARATOR)) {
          if (line.startsWith(":")) continue; // comment / heartbeat
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          } else if (line.startsWith("id:")) {
            // The server stamps durable frames with the per-run seq — the
            // authoritative resume cursor (sent back as Last-Event-ID).
            // Ephemeral node_stream frames deliberately carry NO id.
            eventId = line.slice(3).trim();
          }
        }
        if (dataLines.length > 0) {
          onEvent(eventType, dataLines.join("\n"), eventId);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
