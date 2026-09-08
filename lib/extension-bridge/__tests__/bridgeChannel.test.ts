/**
 * The bridge channel is IDENTITY ONLY — these tests guard the two facts that,
 * if they drift, take the extension bridge down SILENTLY.
 *
 * 1. **The topic is the extension's, verbatim.** Every other channel this app
 *    opens is `mx:<feature>:…`. This one is `matrx-extension-bridge:<userId>`
 *    because the DEPLOYED extension listens there. An `mx:` rename would put
 *    this app in a room of one — no error, no traffic, nothing on a screen.
 * 2. **The wire is raw.** `@ai-matrx/realtime` normally wraps a broadcast in the
 *    Matrx envelope; the extension parses a bare `BridgeEnvelope` with a Zod
 *    schema and logs "malformed payload" for anything else. The spec must
 *    declare `wire: {mode:"raw"}` or the frontend goes mute to the extension.
 *
 * Byte identity of the raw SEND is proven inside the package
 * (`@ai-matrx/realtime` `src/core/raw-wire.test.ts`, against this same fixture);
 * here we prove this app asks for it.
 */

import { bridgeChannelSpec, bridgeEnvelope } from "../bridgeChannel";
import {
  BRIDGE_BROADCAST_EVENT,
  BRIDGE_CHANNEL_PREFIX,
  bridgeChannelName,
  type BridgeEnvelope,
} from "@/lib/types/bridge-envelope";

const USER_ID = "0f9c8c1e-4a2b-4d3e-9f10-2b3c4d5e6f70";

describe("bridge channel identity", () => {
  it("names the topic exactly as the deployed extension listens for it", () => {
    const spec = bridgeChannelSpec(USER_ID, () => {});
    expect(spec.topic).toBe(`matrx-extension-bridge:${USER_ID}`);
    expect(spec.topic).toBe(bridgeChannelName(USER_ID));
    expect(spec.topic.startsWith("mx:")).toBe(false);
    expect(BRIDGE_CHANNEL_PREFIX).toBe("matrx-extension-bridge");
  });

  it("declares the RAW wire, with the echo trade-off stated in code", () => {
    const spec = bridgeChannelSpec(USER_ID, () => {});
    expect(spec.wire).toEqual({ mode: "raw", acceptEchoFromSelf: true });
  });

  it("binds the one broadcast event both repos share", () => {
    const spec = bridgeChannelSpec(USER_ID, () => {});
    expect(spec.broadcast?.map((b) => b.event)).toEqual([BRIDGE_BROADCAST_EVENT]);
    expect(BRIDGE_BROADCAST_EVENT).toBe("FRONTEND_RPC");
  });

  it("supplies a dedup key, which the raw wire has no `eid` to provide", () => {
    const spec = bridgeChannelSpec(USER_ID, () => {});
    const envelope: BridgeEnvelope = {
      direction: "extension->frontend",
      action: "openPanel",
      requestId: "req-1",
      payload: {},
      timestamp: 1,
    };
    expect(spec.eventKey?.("broadcast", envelope)).toBe(
      "extension->frontend:req-1",
    );
    // A payload that is not an envelope has no key rather than a bogus one.
    expect(spec.eventKey?.("broadcast", { nope: true })).toBeUndefined();
  });
});

describe("inbound routing", () => {
  function deliver(payload: unknown): BridgeEnvelope[] {
    const seen: BridgeEnvelope[] = [];
    const spec = bridgeChannelSpec(USER_ID, (envelope) => {
      seen.push(envelope);
    });
    void spec.broadcast?.[0]?.onMessage({
      event: BRIDGE_BROADCAST_EVENT,
      data: payload,
      from: "unknown",
      eventId: "e1",
      sentAt: 0,
      enveloped: false,
    });
    return seen;
  }

  it("passes a well-formed envelope through untouched, both directions", () => {
    const inbound: BridgeEnvelope = {
      direction: "extension->frontend",
      action: "openPanel",
      requestId: "req-2",
      payload: { panelId: "messages" },
      timestamp: 42,
    };
    expect(deliver(inbound)).toEqual([inbound]);
    expect(deliver({ ...inbound, direction: "frontend->extension" })).toHaveLength(1);
  });

  it("drops — loudly — anything that is not a BridgeEnvelope", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(deliver({ direction: "sideways", action: "x", requestId: "y" })).toHaveLength(0);
    expect(deliver(null)).toHaveLength(0);
    expect(deliver({ direction: "extension->frontend", action: 7, requestId: "y" })).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe("outbound envelopes", () => {
  it("mints a frontend->extension envelope with a fresh requestId", () => {
    const envelope = bridgeEnvelope({ action: "ping", payload: { a: 1 } });
    expect(envelope.direction).toBe("frontend->extension");
    expect(envelope.action).toBe("ping");
    expect(envelope.requestId).toHaveLength(36);
    expect(typeof envelope.timestamp).toBe("number");
    expect(Object.keys(envelope).sort()).toEqual([
      "action",
      "direction",
      "payload",
      "requestId",
      "timestamp",
    ]);
  });

  it("ECHOES an inbound requestId when one is given — a reply must correlate", () => {
    const envelope = bridgeEnvelope({
      action: "openPanel",
      payload: { ok: true },
      requestId: "inbound-99",
    });
    expect(envelope.requestId).toBe("inbound-99");
  });
});
