/**
 * useExtensionBridgeChannel — React hook for the matrx-extend bridge.
 *
 * Subscribes to the per-user Supabase Broadcast channel
 * `matrx-extension-bridge:<userId>` and exposes:
 *   - `send(action, payload)` — publish a frontend->extension envelope and
 *     await the matching extension->frontend reply (30s timeout).
 *   - `onMessage(handler)` — receive incoming extension->frontend
 *     envelopes for app-driven reactions (no reply correlation).
 *   - `isReady` — true once the channel is fully subscribed and
 *     `send` will not throw with "channel not subscribed".
 *
 * Auth: short-circuits when no Supabase user is signed in. Channel is
 * scoped to the current user's auth.users.id.
 *
 * Lifecycle: rides the ref-counted channel in
 * `lib/extension-bridge/bridgeChannel.ts`, so multiple consumers in the same
 * tab share one underlying Supabase channel. (That module carries the reason
 * this one channel is still hand-rolled rather than on `@ai-matrx/realtime`:
 * the deployed extension reads the raw envelope off the wire.)
 *
 * Wire format: see `BridgeEnvelope` and `/Users/armanisadeghi/code/common-docs/systems/clients/extension/CHANNELS.md`.
 *
 * Usage notes:
 *   - `ExtensionBridgeSubscriber` mounts this once from `app/Providers.tsx`;
 *     feature surfaces may also call it and share the ref-counted channel.
 *   - The hook does NOT auto-listen for `frontend->extension` echoes —
 *     `onMessage` callbacks fire only for `direction: 'extension->frontend'`
 *     so handlers don't see their own outbound traffic.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  isBridgeSubscribed,
  sendBridgeMessage,
  subscribeToBridge,
  type BridgeHandler,
} from "@/lib/extension-bridge/bridgeChannel";
import type {
  BridgeEnvelope,
  FrontendRpcResponse,
} from "@/lib/types/bridge-envelope";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

/** Default round-trip timeout for `send`. Tuned per the extension SDK
 *  spec — extension SW must reply within 30s or the caller gives up. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Reply shape returned by `send()`. Identical to {@link FrontendRpcResponse}
 * — kept as a local alias so existing consumers of `BridgeReply` keep
 * working. New callers should reference {@link FrontendRpcResponse}
 * from `@/lib/types/bridge-envelope`.
 */
export type BridgeReply = FrontendRpcResponse;

export interface BridgeSendResult {
  requestId: string;
  /** Resolves with the matching reply envelope, or rejects on timeout. */
  promise: Promise<BridgeReply>;
}

export interface UseExtensionBridgeChannelReturn {
  /**
   * Publish a frontend->extension envelope. Returns the requestId
   * synchronously and a promise that resolves with the reply (matched
   * on requestId) or rejects on timeout / channel error.
   */
  send: (
    action: string,
    payload: unknown,
    options?: { timeoutMs?: number },
  ) => Promise<BridgeSendResult>;
  /**
   * Register a handler for inbound extension->frontend envelopes that
   * are NOT replies to a `send()` call. Returns an unsubscribe fn.
   */
  onMessage: (handler: (envelope: BridgeEnvelope) => void) => () => void;
  /** True once the underlying Supabase channel is fully subscribed. */
  isReady: boolean;
  /** True iff there is a signed-in user the channel could subscribe to. */
  isAuthenticated: boolean;
}

/**
 * Internal: parse a reply payload into the canonical `BridgeReply`
 * shape. The extension may wrap results in `{ ok, result, error }` or
 * may put the result directly in `payload` — we normalize either.
 */
function normalizeReply(envelope: BridgeEnvelope): BridgeReply {
  const p = envelope.payload as unknown;
  if (
    p &&
    typeof p === "object" &&
    "ok" in p &&
    typeof (p as { ok: unknown }).ok === "boolean"
  ) {
    return p as BridgeReply;
  }
  // Fallback: treat the payload itself as a successful result.
  return { ok: true, result: p };
}

export function useExtensionBridgeChannel(): UseExtensionBridgeChannelReturn {
  const userId = useSelector(selectUserId);

  // Subscription is asynchronous and supabase-js reports it through a
  // callback the channel module owns, so readiness is polled for up to 5s.
  // It gates `send` from throwing "channel not subscribed".
  const [isReady, setIsReady] = useState(false);

  // External listener registry — `onMessage` callers. Stored in a ref
  // so adding/removing a listener doesn't re-run the channel-setup
  // effect.
  const listenersRef = useRef(new Set<(envelope: BridgeEnvelope) => void>());

  // Pending request map keyed by requestId. Each entry has a resolver
  // and a timeout handle so we can cancel both on cleanup.
  const pendingRef = useRef(
    new Map<
      string,
      {
        resolve: (reply: BridgeReply) => void;
        reject: (err: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
      }
    >(),
  );

  // Stable handler that fans out to listeners + pending-request map.
  const handleEnvelope: BridgeHandler = useCallback((envelope) => {
    if (envelope.direction !== "extension->frontend") return;

    // 1. Pending request resolution — if this envelope's requestId
    //    matches a pending send(), resolve and return; do NOT also
    //    fire it through onMessage listeners (replies are
    //    request-private).
    const pending = pendingRef.current.get(envelope.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRef.current.delete(envelope.requestId);
      pending.resolve(normalizeReply(envelope));
      return;
    }

    // 2. Otherwise it's an extension-initiated event — broadcast to
    //    every onMessage listener.
    listenersRef.current.forEach((listener) => {
      try {
        listener(envelope);
      } catch (err) {
        console.error("[Bridge] onMessage listener threw:", err);
      }
    });
  }, []);

  // Subscribe / unsubscribe lifecycle. Re-runs only when userId changes.
  useEffect(() => {
    if (!userId) {
      setIsReady(false);
      return undefined;
    }

    let cancelled = false;
    const unsubscribe = subscribeToBridge(userId, handleEnvelope);

    // Poll readiness every 100ms for up to 5s.
    const start = Date.now();
    const pollHandle = setInterval(() => {
      if (cancelled) return;
      if (isBridgeSubscribed(userId)) {
        setIsReady(true);
        clearInterval(pollHandle);
      } else if (Date.now() - start > 5_000) {
        // Give up polling; a send throws with a clear error if the channel
        // never came up, rather than failing silently.
        clearInterval(pollHandle);
      }
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(pollHandle);
      // Reject any in-flight requests synchronously.
      pendingRef.current.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(new Error("Bridge channel torn down"));
      });
      pendingRef.current.clear();
      unsubscribe();
      setIsReady(false);
    };
  }, [userId, handleEnvelope]);

  const send = useCallback<UseExtensionBridgeChannelReturn["send"]>(
    async (action, payload, options) => {
      if (!userId) {
        throw new Error(
          "[Bridge] No signed-in user; cannot send extension bridge message.",
        );
      }
      const requestId = crypto.randomUUID();
      const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

      const promise = new Promise<BridgeReply>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (pendingRef.current.delete(requestId)) {
            reject(
              new Error(
                `[Bridge] Request ${requestId} timed out after ${timeoutMs}ms`,
              ),
            );
          }
        }, timeoutMs);
        pendingRef.current.set(requestId, { resolve, reject, timeout });
      });

      try {
        await sendBridgeMessage(userId, { action, payload, requestId });
      } catch (err) {
        // Fail synchronously — clean up the pending entry so the
        // caller's `await` rejects immediately rather than waiting
        // for the timeout.
        const entry = pendingRef.current.get(requestId);
        if (entry) {
          clearTimeout(entry.timeout);
          pendingRef.current.delete(requestId);
        }
        throw err;
      }

      return { requestId, promise };
    },
    [userId],
  );

  const onMessage = useCallback<UseExtensionBridgeChannelReturn["onMessage"]>(
    (handler) => {
      listenersRef.current.add(handler);
      return () => {
        listenersRef.current.delete(handler);
      };
    },
    [],
  );

  return {
    send,
    onMessage,
    isReady,
    isAuthenticated: Boolean(userId),
  };
}
