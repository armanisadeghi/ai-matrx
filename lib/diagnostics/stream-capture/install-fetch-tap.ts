/**
 * The universal stream tap.
 *
 * Wraps `globalThis.fetch` exactly once. For any response carrying an event
 * stream, the body is `tee()`d: one branch goes to the caller completely
 * untouched, the other is drained here and recorded.
 *
 * WHY HERE AND NOT IN `parseNdjsonStream`:
 * a parser-level tap records only the callers that choose to use the parser.
 * Roughly nine call sites read `response.body.getReader()` directly, and
 * nothing stops the next one from being written. Every HTTP stream in the
 * application — every client, every feature, every future one — bottoms out
 * at `fetch`. This is the only place coverage is structural rather than
 * a convention someone has to remember.
 *
 * NON-NEGOTIABLE: this must never change what the caller receives, and must
 * never throw into the caller's path. Every failure here degrades to
 * "no capture", never to "broken request".
 *
 * KNOWN COVERAGE BOUNDARY: WebSocket transports (sandbox adapters, voice
 * agent, Cartesia TTS, Supabase Realtime) are a different substrate and are
 * NOT covered by this tap. They need an equivalent tap on the WebSocket
 * constructor. Do not describe capture as total until that exists.
 */

import {
  beginStream,
  endStream,
  recordBytes,
  recordEvent,
} from "./recorder";
import { CAPTURE_LIMITS, isStreamingContentType } from "./types";

const INSTALL_FLAG = "__matrxStreamTapInstalled" as const;

/**
 * Derive a filterable label from the wire envelope. Mirrors the envelope
 * shapes the backend emits; recording NEVER depends on this succeeding.
 */
function deriveEventType(payload: unknown): string {
  if (payload === null || typeof payload !== "object") return "unknown";
  const o = payload as Record<string, unknown>;

  if (o.event === "data" && o.data && typeof o.data === "object") {
    const inner = (o.data as Record<string, unknown>).type;
    if (typeof inner === "string") return `data:${inner}`;
  }
  if (typeof o.event === "string") return o.event;
  // Compact envelope: { e: "c", t: "<chunk>" }
  if (o.e === "c") return "chunk";
  if (typeof o.e === "string") return o.e;
  if (typeof o.type === "string") return o.type;
  return "unknown";
}

/** Drain the capture branch, splitting NDJSON lines in wire order. */
async function drain(
  body: ReadableStream<Uint8Array>,
  streamId: string,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const recordLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      recordEvent(streamId, {
        ts: Date.now(),
        eventType: deriveEventType(parsed),
        data: parsed,
      });
    } catch {
      // Not JSON (SSE framing, a proxy error page, a truncated line). Keep the
      // raw text — a forensic record that silently drops what it cannot parse
      // is worse than no record, because it looks complete.
      recordEvent(streamId, {
        ts: Date.now(),
        eventType: "unparsed",
        data: null,
        unparsed: trimmed.slice(0, CAPTURE_LIMITS.maxUnparsedChars),
      });
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) recordBytes(streamId, value.byteLength);

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) recordLine(line);
    }

    // Flush trailing multi-byte code units, then any final line that arrived
    // without a newline terminator.
    buffer += decoder.decode();
    recordLine(buffer);

    endStream(streamId, "closed");
  } catch (err) {
    // The caller aborting is normal, not a fault in the stream.
    const name = (err as { name?: string } | null)?.name;
    if (name === "AbortError") {
      endStream(streamId, "aborted");
    } else {
      endStream(streamId, "errored", err instanceof Error ? err.message : String(err));
    }
  } finally {
    reader.releaseLock();
  }
}

export function installStreamTap(): void {
  if (typeof window === "undefined") return;

  const g = globalThis as typeof globalThis & { [INSTALL_FLAG]?: boolean };
  if (g[INSTALL_FLAG]) return;
  g[INSTALL_FLAG] = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function tappedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await originalFetch(input, init);

    try {
      if (!response.body) return response;
      if (!isStreamingContentType(response.headers.get("content-type"))) {
        return response;
      }

      const [callerBranch, captureBranch] = response.body.tee();

      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const streamId = beginStream({
        url,
        method: init?.method ?? (input instanceof Request ? input.method : "GET"),
        requestId: response.headers.get("X-Request-ID"),
        conversationId: response.headers.get("X-Conversation-ID"),
        httpStatus: response.status,
      });

      // Fire-and-forget. Drained eagerly so the tee buffer cannot grow
      // unbounded when the caller consumes slower than the server sends.
      void drain(captureBranch, streamId);

      const tapped = new Response(callerBranch, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });

      // `new Response()` resets `url` to "". Some callers read it, so restore
      // it rather than silently changing observable behaviour.
      Object.defineProperty(tapped, "url", {
        value: response.url,
        configurable: true,
      });

      return tapped;
    } catch (err) {
      // Capture is never worth a failed request.
      console.error("[stream-capture] tap failed; passing response through", err);
      return response;
    }
  };
}
