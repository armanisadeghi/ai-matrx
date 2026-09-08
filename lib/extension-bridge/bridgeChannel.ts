/**
 * The matrx-extend bridge channel — IDENTITY-ONLY WIRING over `@ai-matrx/realtime`.
 *
 * A per-user Supabase Broadcast channel (`matrx-extension-bridge:<userId>`)
 * carrying `BridgeEnvelope`s in both directions between this app and the Chrome
 * extension. Contract: common-docs /systems/clients/extension/CHANNELS.md §4.
 *
 * WHAT USED TO BE HERE, AND WHY IT IS GONE
 * ----------------------------------------
 * This module used to hand-roll the channel: `supabase().channel(...)`, a
 * module-level ref-counted map, a `.on()`-before-`subscribe()` ordering comment,
 * a status callback, manual teardown. It was the LAST hand-rolled `.channel(` in
 * this app, and it stayed hand-rolled for exactly one reason: `@ai-matrx/realtime`
 * wrapped every broadcast in the Matrx envelope (`{v, cid, eid, ts, data}`) while
 * the DEPLOYED extension reads the bare `BridgeEnvelope` off the wire.
 *
 * That reason no longer exists. `@ai-matrx/realtime` 0.5.0 has a raw-wire mode:
 * `wire: {mode:"raw"}` sends the payload verbatim and never reads an envelope on
 * the way in, and `foreignTopic` keeps the peer's topic string on the wire
 * instead of an `mx:` name. So the channel body moved INTO the package —
 * ref-counted shared rooms, jittered reconnect, the ordered handler queue,
 * tab-sleep/network awareness and diagnostics all come with it — and what is
 * left here is the bridge's IDENTITY: its spec and its envelope factory (the
 * namespace itself lives with the rest of the wire format, in
 * `lib/types/bridge-envelope.ts`). There is no `.channel(` in this file and
 * there must never be one again.
 *
 * THE TWO NAMED DOWNGRADES (see the package README § 9 — both announced, neither
 * silent):
 *  - Echo suppression cannot key on `cid`, because a `BridgeEnvelope` has no
 *    sender identity to key on. `acceptEchoFromSelf` states that in code; the
 *    server's `broadcast.self:false` remains the protection, exactly as it was
 *    when this file hand-rolled the channel.
 *  - Dedup cannot key on `eid`, so `eventKey` supplies one from the bridge's own
 *    shape. This is STRICTLY BETTER than the hand-rolled version, which deduped
 *    nothing at all.
 *
 * Subscription itself is `useChannel` in `hooks/useExtensionBridgeChannel.ts` —
 * the package's room registry does the sharing and ref-counting that the map in
 * this file used to do by hand.
 */

import type { ChannelSpec } from "@ai-matrx/realtime";
import {
  BRIDGE_BROADCAST_EVENT,
  bridgeChannelName,
  type BridgeEnvelope,
} from "@/lib/types/bridge-envelope";

export type BridgeHandler = (envelope: BridgeEnvelope) => void;

/** Is this payload a `BridgeEnvelope`? Raw wire means we validate what arrives. */
function asBridgeEnvelope(payload: unknown): BridgeEnvelope | null {
  if (payload === null || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (
    record["direction"] !== "frontend->extension" &&
    record["direction"] !== "extension->frontend"
  ) {
    return null;
  }
  if (typeof record["action"] !== "string") return null;
  if (typeof record["requestId"] !== "string") return null;
  return record as unknown as BridgeEnvelope;
}

/**
 * Build the channel spec for one user's bridge.
 *
 * `onEnvelope` receives EVERY well-formed envelope on the channel, both
 * directions: the request/response correlation in the hook needs to see the
 * matching inbound to resolve. Callers that only want inbound traffic filter on
 * `envelope.direction` themselves (the hook does).
 */
export function bridgeChannelSpec(
  userId: string,
  onEnvelope: BridgeHandler,
): ChannelSpec {
  return {
    // The peer's topic, verbatim — see `EXTENSION_BRIDGE_CHANNEL` in
    // `lib/types/bridge-envelope.ts` for why it is not an `mx:` name.
    topic: bridgeChannelName(userId),
    // THE EXTENSION OWNS THIS WIRE. See the file header.
    wire: { mode: "raw", acceptEchoFromSelf: true },
    broadcast: [
      {
        event: BRIDGE_BROADCAST_EVENT,
        onMessage: ({ data }) => {
          const envelope = asBridgeEnvelope(data);
          if (envelope === null) {
            // Not silent: a malformed payload on this channel means the peer's
            // shape drifted, and the remedy is a contract change, not a retry.
            console.warn(
              "[Bridge] Dropped a payload that is not a BridgeEnvelope. " +
                "If the extension changed its wire shape, CHANNELS.md §4 and " +
                "lib/types/bridge-envelope.ts must change with it.",
              data,
            );
            return;
          }
          onEnvelope(envelope);
        },
      },
    ],
    // Raw wire has no `eid`, so this is what dedup keys on. A redelivered
    // request/reply is one message, not two.
    eventKey: (_source, payload) => {
      const envelope = asBridgeEnvelope(payload);
      return envelope === null
        ? undefined
        : `${envelope.direction}:${envelope.requestId}`;
    },
    // Broadcast is ephemeral and this bridge is request/reply with its own
    // 30s timeouts: there is nothing to re-read after a gap, and the caller
    // already learns about a lost reply. Declaring an empty door would silence
    // the package's warning about a channel that has none, so it is declared
    // honestly, with the reason.
    onBackfill: () => {
      // Intentionally nothing — see above.
    },
  };
}

/** Build an outbound envelope. The only place this app mints one. */
export function bridgeEnvelope(
  input: Pick<BridgeEnvelope, "action" | "payload"> & { requestId?: string },
): BridgeEnvelope {
  return {
    direction: "frontend->extension",
    action: input.action,
    requestId: input.requestId ?? crypto.randomUUID(),
    payload: input.payload,
    timestamp: Date.now(),
  };
}
