/**
 * The WebSocket half of universal capture.
 *
 * `fetch` covers every HTTP call, but four production transports do not use it:
 * the sandbox process/filesystem adapters, the voice-agent realtime client,
 * Cartesia TTS, and Supabase Realtime. Without this tap those are invisible in
 * exactly the way the whole system exists to prevent.
 *
 * Unlike the fetch tap, this one is inherently non-destructive: WebSocket
 * messages are broadcast to every registered listener, so adding ours consumes
 * nothing. The one intercept that DOES mutate behaviour is `send`, which we
 * wrap to record outbound frames — it must always call through, even if
 * recording throws.
 *
 * A socket is one exchange whose events interleave both directions, ordered by
 * arrival. `direction` is what makes that sequence readable.
 */

import { beginExchange, endExchange, recordBytes, recordEvent } from "./recorder";
import { CAPTURE_LIMITS, MAX_UNPARSED_CHARS } from "./types";
import { getCaptureMode } from "./recorder";

const INSTALL_FLAG = "__matrxWsTapInstalled" as const;

/** Turn a frame payload into something recordable without blocking on IO. */
function describePayload(data: unknown): {
  parsed: unknown;
  unparsed?: string;
  bytes: number;
} {
  if (typeof data === "string") {
    const max = CAPTURE_LIMITS[getCaptureMode()].maxBodyChars;
    const clamped = data.slice(0, max);
    try {
      return { parsed: JSON.parse(data), bytes: data.length };
    } catch {
      return {
        parsed: null,
        unparsed: clamped.slice(0, MAX_UNPARSED_CHARS),
        bytes: data.length,
      };
    }
  }
  if (data instanceof ArrayBuffer) {
    return {
      parsed: null,
      unparsed: `[binary ArrayBuffer ${data.byteLength} bytes]`,
      bytes: data.byteLength,
    };
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    // Reading a Blob is async; recording must not delay the frame.
    return {
      parsed: null,
      unparsed: `[binary Blob ${data.size} bytes]`,
      bytes: data.size,
    };
  }
  return { parsed: null, unparsed: "[binary frame]", bytes: 0 };
}

function derive(parsed: unknown, fallback: string): string {
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (typeof o.event === "string") return o.event;
    if (typeof o.type === "string") return o.type;
  }
  return fallback;
}

export function installWebSocketTap(): void {
  if (typeof window === "undefined") return;

  const g = globalThis as typeof globalThis & { [INSTALL_FLAG]?: boolean };
  if (g[INSTALL_FLAG]) return;
  g[INSTALL_FLAG] = true;

  const OriginalWebSocket = globalThis.WebSocket;

  const TappedWebSocket = function (
    this: unknown,
    url: string | URL,
    protocols?: string | string[],
  ) {
    const socket = new OriginalWebSocket(url, protocols);

    let id: string | null = null;
    try {
      id = beginExchange({
        url: typeof url === "string" ? url : url.toString(),
        method: "WS",
        requestHeaders: {},
        requestBody: null,
        requestBodyTruncated: false,
        transport: "websocket",
      });
    } catch (err) {
      console.error("[capture] websocket capture failed to start", err);
    }

    if (id) {
      const exchangeId = id;

      socket.addEventListener("message", (event: MessageEvent) => {
        try {
          const { parsed, unparsed, bytes } = describePayload(event.data);
          recordBytes(exchangeId, bytes);
          recordEvent(exchangeId, {
            ts: Date.now(),
            direction: "in",
            eventType: derive(parsed, unparsed ? "unparsed" : "message"),
            data: parsed,
            ...(unparsed ? { unparsed } : {}),
          });
        } catch {
          // Never let capture interfere with the socket's consumers.
        }
      });

      socket.addEventListener("close", (event: CloseEvent) => {
        endExchange(
          exchangeId,
          "closed",
          event.wasClean ? undefined : `unclean close (code ${event.code})`,
        );
      });

      socket.addEventListener("error", () => {
        endExchange(exchangeId, "errored", "websocket error");
      });

      // The only behaviour-changing intercept: must always call through.
      const originalSend = socket.send.bind(socket);
      socket.send = (data: Parameters<WebSocket["send"]>[0]) => {
        try {
          const { parsed, unparsed, bytes } = describePayload(data);
          recordBytes(exchangeId, bytes);
          recordEvent(exchangeId, {
            ts: Date.now(),
            direction: "out",
            eventType: derive(parsed, unparsed ? "unparsed" : "message"),
            data: parsed,
            ...(unparsed ? { unparsed } : {}),
          });
        } catch {
          // Fall through — sending is not negotiable.
        }
        originalSend(data);
      };
    }

    return socket;
  } as unknown as typeof WebSocket;

  // Preserve the constructor's observable surface: `instanceof`, the readyState
  // constants, and anything else code reads off the global.
  TappedWebSocket.prototype = OriginalWebSocket.prototype;
  Object.defineProperties(TappedWebSocket, {
    CONNECTING: { value: OriginalWebSocket.CONNECTING },
    OPEN: { value: OriginalWebSocket.OPEN },
    CLOSING: { value: OriginalWebSocket.CLOSING },
    CLOSED: { value: OriginalWebSocket.CLOSED },
  });

  globalThis.WebSocket = TappedWebSocket;
}
