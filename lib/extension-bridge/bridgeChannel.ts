/**
 * The matrx-extend bridge channel.
 *
 * A per-user Supabase Broadcast channel (`matrx-extension-bridge:<userId>`)
 * carrying `BridgeEnvelope`s in both directions between this app and the Chrome
 * extension. Contract: common-docs /systems/clients/extension/CHANNELS.md.
 *
 * WHY THIS IS HAND-ROLLED, AND WHAT IT IS NOT
 * -------------------------------------------
 * This code lived inside `lib/supabase/messaging.ts` — it was never messaging.
 * When `@ai-matrx/messaging` replaced that file wholesale (2026-09-07), the
 * bridge came out here rather than being deleted or dragged into the package:
 * it is an extension transport that happened to share a channel-bookkeeping
 * helper.
 *
 * It is deliberately NOT on `@ai-matrx/realtime` yet, and that is the one thing
 * to know before touching it. The realtime package wraps every broadcast in the
 * Matrx envelope (`{v, cid, eid, ts, data}`) — which is what makes echo
 * suppression and dedup possible — and the DEPLOYED extension reads the
 * `BridgeEnvelope` as the payload itself. Moving the bridge onto the package
 * would silently change the wire shape and the extension would stop hearing
 * this app, with nothing failing loudly on either side. The port needs a
 * raw-wire mode in `@ai-matrx/realtime` and a coordinated extension release;
 * it is recorded as a tail in the messaging handoff.
 *
 * Behavior here is the extracted original, unchanged: one channel per user,
 * ref-counted so several `useExtensionBridgeChannel()` callers share it, torn
 * down when the last subscriber leaves.
 */

import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  BRIDGE_BROADCAST_EVENT,
  bridgeChannelName,
  type BridgeEnvelope,
} from "@/lib/types/bridge-envelope";

export type BridgeHandler = (envelope: BridgeEnvelope) => void;

interface BridgeChannelState {
  channel: RealtimeChannel;
  listeners: Set<BridgeHandler>;
  refCount: number;
  isSubscribed: boolean;
}

const channels = new Map<string, BridgeChannelState>();

function supabase() {
  return createClient();
}

/**
 * Subscribe to inbound bridge envelopes for `userId`.
 *
 * The handler receives EVERY envelope on the channel, both directions: the
 * request/response correlation in the hook needs to see its own outbound and
 * the matching inbound to resolve. Callers that only want inbound traffic
 * filter on `envelope.direction` themselves.
 *
 * @returns an unsubscribe function. The channel is torn down only when the last
 *          subscriber leaves.
 */
export function subscribeToBridge(
  userId: string,
  onMessage: BridgeHandler,
): () => void {
  const name = bridgeChannelName(userId);
  let state = channels.get(name);

  if (!state) {
    const channel = supabase().channel(name);
    const created: BridgeChannelState = {
      channel,
      listeners: new Set(),
      refCount: 0,
      isSubscribed: false,
    };
    channels.set(name, created);
    state = created;

    // Handlers BEFORE subscribe, once per channel: `.on()` on an already
    // subscribed channel throws in supabase-js.
    channel.on("broadcast", { event: BRIDGE_BROADCAST_EVENT }, (payload) => {
      const envelope = payload?.payload as BridgeEnvelope | undefined;
      if (!envelope || typeof envelope !== "object") return;
      created.listeners.forEach((handler) => {
        try {
          handler(envelope);
        } catch (err) {
          console.error("[Bridge] Handler threw:", err);
        }
      });
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        created.isSubscribed = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // A transient realtime hiccup (token refresh, reconnect). Supabase
        // retries on its own; one quiet line, not a red error that trips the
        // dev overlay and the admin debug collector.
        created.isSubscribed = false;
        console.warn(`[Bridge] realtime ${status.toLowerCase()} — will retry`);
      }
    });
  }

  state.listeners.add(onMessage);
  state.refCount += 1;

  return () => {
    const current = channels.get(name);
    if (!current) return;
    current.listeners.delete(onMessage);
    current.refCount -= 1;
    if (current.refCount > 0) return;
    void supabase().removeChannel(current.channel);
    channels.delete(name);
  };
}

/** Is the bridge channel for this user live? */
export function isBridgeSubscribed(userId: string): boolean {
  return channels.get(bridgeChannelName(userId))?.isSubscribed ?? false;
}

/**
 * Publish a `frontend->extension` envelope. The channel must already be
 * subscribed (`subscribeToBridge` first, or use the React hook). Resolves once
 * Supabase acknowledges the broadcast; it does NOT wait for the extension's
 * reply — the caller correlates on `requestId`.
 */
export async function sendBridgeMessage(
  userId: string,
  envelope: Pick<BridgeEnvelope, "action" | "payload" | "requestId">,
): Promise<{ requestId: string }> {
  const name = bridgeChannelName(userId);
  const state = channels.get(name);

  if (!state || !state.isSubscribed) {
    throw new Error(
      `[Bridge] Channel for user ${userId} is not subscribed. Call subscribeToBridge first.`,
    );
  }

  const requestId = envelope.requestId ?? crypto.randomUUID();
  const outbound: BridgeEnvelope = {
    direction: "frontend->extension",
    action: envelope.action,
    requestId,
    payload: envelope.payload,
    timestamp: Date.now(),
  };

  await state.channel.send({
    type: "broadcast",
    event: BRIDGE_BROADCAST_EVENT,
    payload: outbound,
  });

  return { requestId };
}

/** Tear every bridge channel down. Called on sign-out. */
export function resetBridgeChannels(): void {
  channels.forEach((state) => {
    void supabase().removeChannel(state.channel);
  });
  channels.clear();
}
