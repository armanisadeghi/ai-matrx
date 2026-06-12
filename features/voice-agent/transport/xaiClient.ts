// features/voice-agent/transport/xaiClient.ts
//
// WebSocket lifecycle for the xAI Realtime voice agent.
//
// This module is React-free and Redux-free. It exposes a typed event stream
// to the orchestrator (`useXaiVoiceSession`), which is responsible for
// translating events into slice actions and audio module calls.
//
// Connection model:
//   - Single WebSocket per `XaiClient` instance.
//   - Subprotocol-based auth: `xai-client-secret.<ephemeral_token>`.
//   - Strict 10s connection timeout — failure surfaces as a `connect-failed`
//     error event, not a hang.
//   - Intentional close (user clicks "stop") is distinguished from network
//     close (so we don't show error UI on a deliberate disconnect).

import {
  buildAudioAppend,
  buildResponseCancel,
  buildSessionUpdate,
  type SessionUpdatePayload,
} from "./clientEvents";
import { int16BufferToBase64 } from "../audio/pcmEncoding";
import { parseServerEvent, type XaiServerEvent } from "./serverEvents";
import { XAI_REALTIME_URL } from "../constants";

const CONNECT_TIMEOUT_MS = 10_000;

export type XaiClientErrorCode =
  | "connect-failed"
  | "connect-timeout"
  | "auth-failed"
  | "transport-closed"
  | "server-error";

export interface XaiClientError {
  code: XaiClientErrorCode;
  message: string;
  cause?: unknown;
}

export interface XaiClient {
  connect: (
    token: string,
    sessionConfig: SessionUpdatePayload,
  ) => Promise<void>;
  sendInputAudio: (frame: ArrayBuffer) => void;
  cancelResponse: () => void;
  /** Send a pre-built JSON payload (escape hatch for function-call output, etc.). */
  sendRaw: (payload: string) => void;
  /** Closes the socket; flags this as intentional so the close handler doesn't emit an error. */
  disconnect: () => void;
  onEvent: (cb: (event: XaiServerEvent) => void) => () => void;
  onError: (cb: (err: XaiClientError) => void) => () => void;
  onClose: (
    cb: (info: { intentional: boolean; code: number | null }) => void,
  ) => () => void;
  /** Returns true after the session.updated handshake completes. */
  isStreamingReady: () => boolean;
  isOpen: () => boolean;
}

export function createXaiClient(): XaiClient {
  let ws: WebSocket | null = null;
  let intentionalClose = false;
  let streamingReady = false;

  const eventCallbacks = new Set<(e: XaiServerEvent) => void>();
  const errorCallbacks = new Set<(e: XaiClientError) => void>();
  const closeCallbacks = new Set<
    (info: { intentional: boolean; code: number | null }) => void
  >();

  function emitEvent(e: XaiServerEvent): void {
    for (const cb of eventCallbacks) {
      try {
        cb(e);
      } catch (err) {
        console.error("[xaiClient] event handler threw:", err);
      }
    }
  }
  function emitError(e: XaiClientError): void {
    for (const cb of errorCallbacks) {
      try {
        cb(e);
      } catch {
        // ignore
      }
    }
  }
  function emitClose(info: {
    intentional: boolean;
    code: number | null;
  }): void {
    for (const cb of closeCallbacks) {
      try {
        cb(info);
      } catch {
        // ignore
      }
    }
  }

  function connect(
    token: string,
    sessionConfig: SessionUpdatePayload,
  ): Promise<void> {
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      return Promise.resolve();
    }
    intentionalClose = false;
    streamingReady = false;

    return new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let resolved = false;

      let socket: WebSocket;
      try {
        socket = new WebSocket(XAI_REALTIME_URL, [
          `xai-client-secret.${token}`,
        ]);
      } catch (err) {
        const e: XaiClientError = {
          code: "connect-failed",
          message:
            err instanceof Error
              ? err.message
              : "Failed to construct WebSocket",
          cause: err,
        };
        emitError(e);
        reject(e);
        return;
      }
      ws = socket;
      // We exchange JSON only.
      socket.binaryType = "arraybuffer";

      timeoutId = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        const e: XaiClientError = {
          code: "connect-timeout",
          message: `WebSocket did not reach OPEN within ${CONNECT_TIMEOUT_MS}ms`,
        };
        try {
          socket.close();
        } catch {
          // ignore
        }
        emitError(e);
        reject(e);
      }, CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        // Send the session config IMMEDIATELY — every ms here is added to first-audio latency.
        try {
          socket.send(buildSessionUpdate(sessionConfig));
        } catch (err) {
          const e: XaiClientError = {
            code: "transport-closed",
            message: "WebSocket closed before session.update could be sent.",
            cause: err,
          };
          emitError(e);
          reject(e);
          return;
        }
        resolved = true;
        resolve();
      };

      socket.onmessage = (msg: MessageEvent) => {
        if (typeof msg.data !== "string") return;
        const event = parseServerEvent(msg.data);
        if (event.type === "session.updated") {
          streamingReady = true;
        } else if (event.type === "error") {
          emitError({
            code: "server-error",
            message: `[${event.code}] ${event.message}`,
          });
        } else if (
          event.type === "unknown" &&
          process.env.NODE_ENV !== "production"
        ) {
          console.warn("[xaiClient] Unknown server event:", event.raw);
        }
        emitEvent(event);
      };

      socket.onerror = () => {
        if (resolved) return;
        resolved = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        const e: XaiClientError = {
          code: "connect-failed",
          message:
            "WebSocket connection error. Check network and xAI key permissions.",
        };
        emitError(e);
        reject(e);
      };

      socket.onclose = (event: CloseEvent) => {
        const wasOpen = streamingReady;
        ws = null;
        streamingReady = false;
        if (!intentionalClose && !wasOpen) {
          // Closed before handshake — likely auth or network.
          if (event.code === 4001 || event.code === 4003) {
            emitError({
              code: "auth-failed",
              message:
                "xAI rejected the client_secret. Refreshing token may help.",
            });
          }
        }
        emitClose({ intentional: intentionalClose, code: event.code });
        if (!resolved) {
          resolved = true;
          reject({
            code: "transport-closed",
            message: `WebSocket closed (code ${event.code}) before OPEN.`,
          } satisfies XaiClientError);
        }
      };
    });
  }

  function sendInputAudio(frame: ArrayBuffer): void {
    if (!ws || ws.readyState !== WebSocket.OPEN || !streamingReady) return;
    try {
      ws.send(buildAudioAppend(int16BufferToBase64(frame)));
    } catch (err) {
      console.warn("[xaiClient] sendInputAudio failed:", err);
    }
  }

  function cancelResponse(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(buildResponseCancel());
    } catch {
      // ignore
    }
  }

  function sendRaw(payload: string): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(payload);
    } catch (err) {
      console.warn("[xaiClient] sendRaw failed:", err);
    }
  }

  function disconnect(): void {
    intentionalClose = true;
    streamingReady = false;
    if (ws) {
      try {
        ws.close(1000, "client-disconnect");
      } catch {
        // ignore
      }
      ws = null;
    }
  }

  function onEvent(cb: (event: XaiServerEvent) => void): () => void {
    eventCallbacks.add(cb);
    return () => eventCallbacks.delete(cb);
  }
  function onError(cb: (err: XaiClientError) => void): () => void {
    errorCallbacks.add(cb);
    return () => errorCallbacks.delete(cb);
  }
  function onClose(
    cb: (info: { intentional: boolean; code: number | null }) => void,
  ): () => void {
    closeCallbacks.add(cb);
    return () => closeCallbacks.delete(cb);
  }
  function isStreamingReady(): boolean {
    return streamingReady;
  }
  function isOpen(): boolean {
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }

  return {
    connect,
    sendInputAudio,
    cancelResponse,
    sendRaw,
    disconnect,
    onEvent,
    onError,
    onClose,
    isStreamingReady,
    isOpen,
  };
}
