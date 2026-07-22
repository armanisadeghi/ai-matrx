/**
 * The universal exchange tap.
 *
 * Wraps `globalThis.fetch` exactly once and records BOTH directions:
 *   • outbound — method, url, headers (credentials redacted), request body
 *   • inbound  — status, headers, and either the ordered stream events or the
 *                whole response body
 *
 * For streaming responses the body is `tee()`d: one branch goes to the caller
 * completely untouched, the other is drained here.
 *
 * WHY HERE AND NOT IN `parseNdjsonStream`:
 * a parser-level tap records only the callers that choose to use the parser.
 * Roughly nine call sites read `response.body.getReader()` directly, and
 * nothing stops the next one from being written. Every HTTP call in the
 * application bottoms out at `fetch`. This is the only place where coverage is
 * structural rather than a convention someone has to remember.
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
  attachResponse,
  beginExchange,
  endExchange,
  getCaptureMode,
  recordBytes,
  recordEvent,
  recordResponseBody,
} from "./recorder";
import {
  CAPTURE_LIMITS,
  MAX_UNPARSED_CHARS,
  isStreamingContentType,
  redactHeaders,
} from "./types";

const INSTALL_FLAG = "__matrxCaptureTapInstalled" as const;

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

/**
 * Read the outbound body without consuming it for the caller.
 *
 * A `Request` body can only be read once, so we clone first. A plain
 * string/URLSearchParams init body is already in hand and needs no clone.
 */
async function readRequestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<{ body: string | null; truncated: boolean }> {
  const max = CAPTURE_LIMITS[getCaptureMode()].maxBodyChars;
  const clamp = (text: string) => ({
    body: text.slice(0, max),
    truncated: text.length > max,
  });

  try {
    if (typeof init?.body === "string") return clamp(init.body);
    if (init?.body instanceof URLSearchParams) return clamp(init.body.toString());
    if (init?.body) return { body: "[non-text body]", truncated: false };
    if (input instanceof Request && input.body) {
      return clamp(await input.clone().text());
    }
  } catch {
    // A body we cannot read is not a reason to fail the request.
    return { body: "[unreadable body]", truncated: false };
  }
  return { body: null, truncated: false };
}

/** Drain the capture branch of a stream, splitting NDJSON lines in wire order. */
async function drainStream(
  body: ReadableStream<Uint8Array>,
  id: string,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const recordLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      recordEvent(id, {
        ts: Date.now(),
        eventType: deriveEventType(parsed),
        data: parsed,
      });
    } catch {
      // Not JSON (SSE framing, a proxy error page, a truncated line). Keep the
      // raw text — a forensic record that silently drops what it cannot parse
      // is worse than no record, because it looks complete.
      recordEvent(id, {
        ts: Date.now(),
        eventType: "unparsed",
        data: null,
        unparsed: trimmed.slice(0, MAX_UNPARSED_CHARS),
      });
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) recordBytes(id, value.byteLength);

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) recordLine(line);
    }

    // Flush trailing multi-byte code units, then any final line that arrived
    // without a newline terminator.
    buffer += decoder.decode();
    recordLine(buffer);

    endExchange(id, "closed");
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "AbortError") {
      endExchange(id, "aborted");
    } else {
      endExchange(
        id,
        "errored",
        err instanceof Error ? err.message : String(err),
      );
    }
  } finally {
    reader.releaseLock();
  }
}

/** Drain the capture branch of a non-streaming response as a single body. */
async function drainBody(
  body: ReadableStream<Uint8Array>,
  id: string,
): Promise<void> {
  try {
    const text = await new Response(body).text();
    recordBytes(id, text.length);
    recordResponseBody(id, text);
    endExchange(id, "closed");
  } catch (err) {
    endExchange(id, "errored", err instanceof Error ? err.message : String(err));
  }
}

export function installCaptureTap(): void {
  if (typeof window === "undefined") return;

  const g = globalThis as typeof globalThis & { [INSTALL_FLAG]?: boolean };
  if (g[INSTALL_FLAG]) return;
  g[INSTALL_FLAG] = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function tappedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let id: string | null = null;

    // ── Outbound ──────────────────────────────────────────────────────────
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      const { body, truncated } = await readRequestBody(input, init);

      id = beginExchange({
        url,
        method:
          init?.method ?? (input instanceof Request ? input.method : "GET"),
        requestHeaders: redactHeaders(headers),
        requestBody: body,
        requestBodyTruncated: truncated,
      });
    } catch (err) {
      console.error("[capture] outbound capture failed", err);
      id = null;
    }

    // ── The actual request — never wrapped in capture's failure modes ─────
    let response: Response;
    try {
      response = await originalFetch(input, init);
    } catch (err) {
      if (id) {
        endExchange(
          id,
          (err as { name?: string } | null)?.name === "AbortError"
            ? "aborted"
            : "errored",
          err instanceof Error ? err.message : String(err),
        );
      }
      throw err;
    }

    // ── Inbound ───────────────────────────────────────────────────────────
    try {
      if (!id) return response;

      const isStream = isStreamingContentType(
        response.headers.get("content-type"),
      );

      attachResponse(id, {
        httpStatus: response.status,
        statusText: response.statusText,
        responseHeaders: redactHeaders(response.headers),
        requestId: response.headers.get("X-Request-ID"),
        conversationId: response.headers.get("X-Conversation-ID"),
        isStream,
      });

      if (!response.body) {
        endExchange(id, "closed");
        return response;
      }

      const [callerBranch, captureBranch] = response.body.tee();

      // Fire-and-forget. Drained eagerly so the tee buffer cannot grow
      // unbounded when the caller consumes slower than the server sends.
      if (isStream) {
        void drainStream(captureBranch, id);
      } else {
        void drainBody(captureBranch, id);
      }

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
      console.error("[capture] tap failed; passing response through", err);
      return response;
    }
  };
}
