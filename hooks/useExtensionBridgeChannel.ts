/**
 * useExtensionBridgeChannel — React hook for the matrx-extend bridge.
 *
 * Rides `@ai-matrx/realtime`'s `useChannel` on the bridge's spec
 * (`lib/extension-bridge/bridgeChannel.ts`). The package owns the channel:
 * ONE shared, ref-counted room per declared topic, so several callers of this
 * hook in one tab share one underlying Supabase channel; enforced teardown;
 * jittered reconnect; the decoupled ordered handler queue; tab-sleep and
 * network awareness; diagnostics. Since realtime 0.5.0 it also owns the bridge's
 * RAW WIRE — the payload goes out verbatim as the deployed extension expects and
 * is never envelope-unwrapped on the way in.
 *
 * Exposes:
 *   - `send(action, payload)` — publish a frontend->extension envelope and
 *     await the matching extension->frontend reply (30s timeout).
 *   - `reply(inbound, payload)` — answer an extension-initiated envelope,
 *     preserving its `requestId` so the extension's pending-promise table
 *     resolves the right caller.
 *   - `onMessage(handler)` — receive incoming extension->frontend envelopes
 *     that are NOT replies to a `send()` (no reply correlation).
 *   - `isReady` — true once the channel is connected and `send` will publish.
 *
 * Auth: short-circuits when no Supabase user is signed in. Channel is scoped to
 * the current user's `auth.users.id`.
 *
 * Wire format: see `BridgeEnvelope` and
 * /Users/armanisadeghi/code/common-docs/systems/clients/extension/CHANNELS.md §4.
 *
 * Usage notes:
 *   - `ExtensionBridgeSubscriber` mounts this once from `app/Providers.tsx`;
 *     feature surfaces may also call it and share the room.
 *   - `onMessage` callbacks fire only for `direction: 'extension->frontend'`,
 *     so handlers never see their own outbound traffic.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import { useChannel } from "@ai-matrx/realtime/react";
import {
  bridgeChannelSpec,
  bridgeEnvelope,
} from "@/lib/extension-bridge/bridgeChannel";
import {
  BRIDGE_BROADCAST_EVENT,
  type BridgeEnvelope,
  type FrontendRpcResponse,
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
   * Answer an extension-initiated envelope. A REPLY must echo the inbound
   * `requestId` — minting a fresh one resolves the wrong caller in the
   * extension's pending table, which is why this is a first-class door rather
   * than each consumer reaching for the channel module.
   */
  reply: (inbound: BridgeEnvelope, payload: unknown) => void;
  /**
   * Register a handler for inbound extension->frontend envelopes that
   * are NOT replies to a `send()` call. Returns an unsubscribe fn.
   */
  onMessage: (handler: (envelope: BridgeEnvelope) => void) => () => void;
  /** True once the underlying Supabase channel is connected. */
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

  // External listener registry — `onMessage` callers. Stored in a ref
  // so adding/removing a listener doesn't re-run the channel-setup effect.
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
  const handleEnvelope = useCallback((envelope: BridgeEnvelope) => {
    if (envelope.direction !== "extension->frontend") return;

    // 1. Pending request resolution — if this envelope's requestId matches a
    //    pending send(), resolve and return; do NOT also fire it through
    //    onMessage listeners (replies are request-private).
    const pending = pendingRef.current.get(envelope.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRef.current.delete(envelope.requestId);
      pending.resolve(normalizeReply(envelope));
      return;
    }

    // 2. Otherwise it's an extension-initiated event — fan out to listeners.
    listenersRef.current.forEach((listener) => {
      try {
        listener(envelope);
      } catch (err) {
        console.error("[Bridge] onMessage listener threw:", err);
      }
    });
  }, []);

  // The spec is rebuilt per render; `useChannel` keys the subscription on the
  // channel's SHAPE (topic + bindings + wire), never on object identity, so
  // this does not churn the room.
  const spec = useMemo(
    () => (userId ? bridgeChannelSpec(userId, handleEnvelope) : null),
    [userId, handleEnvelope],
  );

  const { status, send: publish } = useChannel(spec);
  const isReady = status === "connected";

  // Reject in-flight requests when the channel goes away, rather than letting
  // each one sit out its full 30s timeout.
  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      pending.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(new Error("Bridge channel torn down"));
      });
      pending.clear();
    };
  }, []);

  const send = useCallback<UseExtensionBridgeChannelReturn["send"]>(
    async (action, payload, options) => {
      if (!userId) {
        throw new Error(
          "[Bridge] No signed-in user; cannot send extension bridge message.",
        );
      }
      const envelope = bridgeEnvelope({ action, payload });
      const requestId = envelope.requestId;
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

      // The package refuses to pretend a send succeeded while disconnected —
      // it says so through diagnostics. This says so to the CALLER, which is
      // the half the package cannot do, so an unsendable request fails now
      // instead of after 30 silent seconds.
      if (!isReady) {
        const entry = pendingRef.current.get(requestId);
        if (entry) {
          clearTimeout(entry.timeout);
          pendingRef.current.delete(requestId);
        }
        throw new Error(
          `[Bridge] Channel for user ${userId} is ${status}; the message was not sent. ` +
            `Wait for isReady, or fall back to the same-machine chrome.runtime transport.`,
        );
      }

      publish(BRIDGE_BROADCAST_EVENT, envelope);
      return { requestId, promise };
    },
    [userId, isReady, status, publish],
  );

  const reply = useCallback<UseExtensionBridgeChannelReturn["reply"]>(
    (inbound, payload) => {
      publish(BRIDGE_BROADCAST_EVENT, {
        ...bridgeEnvelope({
          action: inbound.action,
          payload,
          requestId: inbound.requestId,
        }),
      });
    },
    [publish],
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
    reply,
    onMessage,
    isReady,
    isAuthenticated: Boolean(userId),
  };
}
