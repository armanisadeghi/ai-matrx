import { buildHeaders, resolveBaseUrl } from "@/lib/python-client";

export type GoogleRealtimeChannel = "live" | "music";
export type GoogleRealtimeConnectionState =
  "idle" | "connecting" | "ready" | "reconnecting" | "closed" | "error";

export interface GoogleRealtimeSetup {
  model: string;
  options?: Record<string, unknown>;
}

export interface GoogleRealtimeClient {
  connect: () => Promise<void>;
  send: (message: Record<string, unknown>) => void;
  close: () => void;
  onEvent: (listener: (event: Record<string, unknown>) => void) => () => void;
  onState: (
    listener: (state: GoogleRealtimeConnectionState, detail?: string) => void,
  ) => () => void;
}

const MAX_RECONNECT_ATTEMPTS = 4;
const MAX_QUEUED_MESSAGES = 500;

function socketUrl(channel: GoogleRealtimeChannel): string {
  const base = new URL(resolveBaseUrl());
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `/ai/google/${channel}`;
  base.search = "";
  base.hash = "";
  return base.toString();
}

async function accessToken(): Promise<string> {
  const { headers } = await buildHeaders({}, false);
  const authorization = headers.Authorization;
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error(
      "A signed-in session is required for Google realtime models.",
    );
  }
  return authorization.slice("Bearer ".length);
}

/**
 * Browser-to-aidream realtime transport. The server owns the Google key and
 * provider protocol; the browser authenticates in the first frame because the
 * WebSocket constructor cannot attach an Authorization header.
 */
export function createGoogleRealtimeClient(
  channel: GoogleRealtimeChannel,
  setup: GoogleRealtimeSetup,
): GoogleRealtimeClient {
  let socket: WebSocket | null = null;
  let desiredOpen = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionHandle: string | null = null;
  const queued: Record<string, unknown>[] = [];
  const eventListeners = new Set<(event: Record<string, unknown>) => void>();
  const stateListeners = new Set<
    (state: GoogleRealtimeConnectionState, detail?: string) => void
  >();

  const emitState = (state: GoogleRealtimeConnectionState, detail?: string) => {
    for (const listener of stateListeners) listener(state, detail);
  };

  const flush = () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    for (const message of queued.splice(0)) {
      socket.send(JSON.stringify(message));
    }
  };

  const findSessionHandle = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const direct = record.new_handle ?? record.session_handle ?? record.handle;
    if (typeof direct === "string" && direct.length > 0) return direct;
    for (const child of Object.values(record)) {
      const nested = findSessionHandle(child);
      if (nested) return nested;
    }
    return null;
  };

  const open = async (): Promise<void> => {
    const token = await accessToken();
    if (!desiredOpen) return;
    emitState(reconnectAttempts > 0 ? "reconnecting" : "connecting");
    const next = new WebSocket(socketUrl(channel));
    socket = next;

    next.onopen = () => {
      const options = {
        ...(setup.options ?? {}),
        ...(sessionHandle ? { session_handle: sessionHandle } : {}),
      };
      next.send(
        JSON.stringify({
          type: "setup",
          access_token: token,
          model: setup.model,
          ...(Object.keys(options).length > 0 ? { options } : {}),
        }),
      );
    };

    next.onmessage = (message) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(String(message.data)) as Record<string, unknown>;
      } catch {
        emitState("error", "The realtime service returned malformed data.");
        return;
      }
      const nextHandle = findSessionHandle(event);
      if (nextHandle) sessionHandle = nextHandle;
      if (event.type === "ready") {
        reconnectAttempts = 0;
        emitState("ready");
        flush();
      } else if (event.type === "error") {
        emitState("error", String(event.message ?? "Realtime service error"));
      }
      for (const listener of eventListeners) listener(event);
    };

    next.onerror = () => {
      emitState("error", "The realtime connection failed.");
    };

    next.onclose = () => {
      if (socket === next) socket = null;
      if (!desiredOpen) {
        emitState("closed");
        return;
      }
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        emitState("error", "The realtime session could not reconnect.");
        desiredOpen = false;
        return;
      }
      reconnectAttempts += 1;
      emitState("reconnecting", "Connection interrupted — resuming session…");
      reconnectTimer = setTimeout(
        () =>
          void open().catch((error: unknown) => {
            emitState(
              "error",
              error instanceof Error ? error.message : String(error),
            );
          }),
        Math.min(8_000, 500 * 2 ** reconnectAttempts),
      );
    };
  };

  return {
    connect: async () => {
      desiredOpen = true;
      reconnectAttempts = 0;
      await open();
    },
    send: (message) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return;
      }
      queued.push(message);
      if (queued.length > MAX_QUEUED_MESSAGES) queued.shift();
    },
    close: () => {
      desiredOpen = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      queued.length = 0;
      socket?.close(1000, "client stop");
      socket = null;
      emitState("closed");
    },
    onEvent: (listener) => {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    onState: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  };
}
