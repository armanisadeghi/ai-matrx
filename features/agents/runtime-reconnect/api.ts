/**
 * Runtime reconnect transport — the status fetch + the SSE follower.
 *
 * Raw fetch (not `callApi`) for the same reason `runAiStream` is raw fetch:
 * these calls are conversation-scoped, so they must ride the SAME backend
 * channel resolution as the conversation's own stream
 * (`resolveBackendForConversation` — global / sandbox override / local engine /
 * EC2-dedicated), which the global `callApi` deliberately does not do.
 *
 * The SSE consumer is fetch-based, NOT `EventSource` — EventSource cannot set
 * the Authorization header, which would force the JWT into a query param.
 * Frame parsing accepts all three SSE separators (\r\n\r\n, \n\n, \r\r):
 * sse-starlette emits CRLF, and matching only "\n\n" parses ZERO frames from
 * the real server (the exact bug that silently killed workflow studio's push
 * transport, found live 2026-07-09).
 */

import type { ResolvedBackend } from "../redux/execution-system/thunks/resolve-base-url";
import type {
  RuntimeExecutionStatus,
  RuntimeOperationEvent,
  RuntimeOperationsByLinkResponse,
} from "./types";

const SSE_FRAME_SEPARATOR = /\r\n\r\n|\n\n|\r\r/;
/**
 * The server pings every ~15s, so a wire that is open but silent past this is
 * dead (buffering proxy, idle-killed connection) — abort and retry rather than
 * hanging the reconnect forever on a connection that will never speak.
 */
const STALL_TIMEOUT_MS = 45_000;
const RECONNECT_LIMIT = 3;
const RECONNECT_DELAY_MS = 2_000;

function streamHeaders(backend: ResolvedBackend): Record<string, string> {
  const headers: Record<string, string> = { ...backend.headers };
  // GET has no body — Content-Type is the chat POST channel's concern.
  delete headers["Content-Type"];
  return headers;
}

/**
 * `GET /runtime/operations/by-link/conversation/{conversationId}` — the
 * identify step. Returns `null` when the surface is absent or the caller owns
 * no operations for this conversation (404 — missing and unowned share one
 * shape by design); throws on other failures.
 */
export async function fetchOperationsByLink(
  backend: ResolvedBackend,
  conversationId: string,
  signal?: AbortSignal,
): Promise<RuntimeOperationsByLinkResponse | null> {
  const url = `${backend.baseUrl}/runtime/operations/by-link/conversation/${conversationId}?limit=5`;
  const res = await fetch(url, {
    method: "GET",
    headers: streamHeaders(backend),
    ...(signal ? { signal } : {}),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `runtime operations-by-link failed: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as RuntimeOperationsByLinkResponse;
}

export interface FollowOperationResult {
  /** True when the server sent the terminal `end` frame. */
  ended: boolean;
  /** The root status carried on the `end` frame (when `ended`). */
  status: RuntimeExecutionStatus | null;
}

export interface FollowOperationOptions {
  backend: ResolvedBackend;
  executionId: string;
  /** Resume cursor — the operation view's `last_event_seq` (0 = from start). */
  lastEventSeq: number;
  /** Caller teardown — aborting resolves the promise with `ended: false`. */
  signal: AbortSignal;
  /** Fired per durable spine event (lifecycle transitions + notes). */
  onEvent: (event: RuntimeOperationEvent, seq: number | null) => void;
}

/**
 * `GET /runtime/executions/{id}/events/stream` — SSE replay-then-follow with
 * bounded reconnects. Resolves `{ended: true, status}` on the server's `end`
 * frame (the operation settled); `{ended: false}` when the caller aborted or
 * every reconnect attempt failed. A WAITING_INPUT park keeps the stream open
 * by design — a resume re-attaches to the same execution and its events
 * continue arriving here on the same cursor.
 */
export async function followOperationStream(
  opts: FollowOperationOptions,
): Promise<FollowOperationResult> {
  let cursor = opts.lastEventSeq;
  let failures = 0;

  while (!opts.signal.aborted && failures < RECONNECT_LIMIT) {
    const attempt = new AbortController();
    const onOuterAbort = () => attempt.abort();
    opts.signal.addEventListener("abort", onOuterAbort, { once: true });

    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const armStall = () => {
      if (stallTimer !== null) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => attempt.abort(), STALL_TIMEOUT_MS);
    };

    try {
      const headers = streamHeaders(opts.backend);
      headers["Accept"] = "text/event-stream";
      if (cursor > 0) headers["Last-Event-ID"] = String(cursor);

      const res = await fetch(
        `${opts.backend.baseUrl}/runtime/executions/${opts.executionId}/events/stream`,
        { method: "GET", headers, signal: attempt.signal },
      );
      if (!res.ok || !res.body) {
        throw new Error(`runtime event stream failed: ${res.status}`);
      }

      armStall();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: RegExpExecArray | null;
          while ((sep = SSE_FRAME_SEPARATOR.exec(buffer)) !== null) {
            const frame = buffer.slice(0, sep.index);
            buffer = buffer.slice(sep.index + sep[0].length);
            // Any parsed frame — comment heartbeats included — proves the
            // wire is alive: reset both the stall timer and the retry budget.
            armStall();
            failures = 0;

            let eventType = "message";
            let eventId: string | undefined;
            const dataLines: string[] = [];
            for (const line of frame.split(/\r\n|\n|\r/)) {
              if (line.startsWith(":")) continue;
              if (line.startsWith("event:")) eventType = line.slice(6).trim();
              else if (line.startsWith("data:"))
                dataLines.push(line.slice(5).replace(/^ /, ""));
              else if (line.startsWith("id:")) eventId = line.slice(3).trim();
            }
            if (dataLines.length === 0) continue;
            const dataText = dataLines.join("\n");

            if (eventType === "end") {
              let status: RuntimeExecutionStatus | null = null;
              try {
                const parsed = JSON.parse(dataText) as { status?: string };
                if (typeof parsed.status === "string") {
                  status = parsed.status as RuntimeExecutionStatus;
                }
              } catch {
                // malformed end payload — still terminal
              }
              return { ended: true, status };
            }
            if (eventType === "execution_event") {
              const seq =
                eventId && Number.isInteger(Number(eventId))
                  ? Number(eventId)
                  : null;
              if (seq !== null && seq > cursor) cursor = seq;
              try {
                opts.onEvent(
                  JSON.parse(dataText) as RuntimeOperationEvent,
                  seq,
                );
              } catch {
                // malformed frame — the durable ledger heals gaps on reconnect
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      // Server closed without an `end` frame (e.g. process restart). Retry —
      // Last-Event-ID replays anything missed from the durable ledger.
      failures += 1;
    } catch {
      if (opts.signal.aborted) break;
      failures += 1;
    } finally {
      if (stallTimer !== null) clearTimeout(stallTimer);
      opts.signal.removeEventListener("abort", onOuterAbort);
    }

    if (!opts.signal.aborted && failures < RECONNECT_LIMIT) {
      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
    }
  }

  return { ended: false, status: null };
}
