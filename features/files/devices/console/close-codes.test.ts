/**
 * Every close code the relay can send, through the REAL protocol client the console runs, to the
 * pill and the one line a person sees. The client decides reconnect vs stop from CLOSE_RULES; this
 * proves the console never invents its own list and never shows a stop as "Reconnecting…".
 */
import { CLOSE_RULES, CloseCode, SUBPROTOCOL, closeRule } from "@ai-matrx/desktop-protocol";
import { createDesktopClient } from "@ai-matrx/desktop-protocol/client";
import type { WebSocketLike } from "@ai-matrx/desktop-protocol/client";

import { STOPPED, consoleStatus } from "./connection";
import { relaySubprotocols } from "./relay";

/** The WHATWG socket surface the client touches, nothing more. */
class FakeSocket implements WebSocketLike {
  readyState = 0;
  binaryType = "blob";
  sent: string[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(readonly protocols: string[]) {}
  send(data: string | ArrayBuffer | Uint8Array): void {
    if (this.readyState !== 1) throw new Error("InvalidStateError");
    if (typeof data === "string") this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  closeWith(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: "" });
  }
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function harness() {
  const sockets: FakeSocket[] = [];
  const client = createDesktopClient({
    url: "wss://relay.test/v1/devices/d/connect",
    protocols: () => relaySubprotocols("t"),
    clientType: "web",
    clientVersion: "test",
    webSocket: (_url, protocols) => {
      const s = new FakeSocket(protocols);
      sockets.push(s);
      return s;
    },
    backoff: { jitter: 0, initialDelayMs: 1000 },
    onDiagnostic: () => undefined,
  });
  return { client, sockets };
}

const codes = Object.keys(CLOSE_RULES).map(Number);

describe("every relay close code, as the phone console shows it", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("offers the relay subprotocol AND this client's version subprotocol, token last", async () => {
    const h = harness();
    h.client.connect();
    await flush();
    const offered = h.sockets[0]!.protocols;
    expect(offered[0]).toBe(SUBPROTOCOL);
    expect(offered[1]).toMatch(/^matrx\.v1\.\d+$/);
    expect(offered[2]).toBe("bearer.t");
    h.client.close();
  });

  it("every close code the protocol defines has a rule, so every one is walked below", () => {
    const defined = [...new Set(Object.values(CloseCode) as number[])].sort((a, b) => a - b);
    expect([...codes].sort((a, b) => a - b)).toEqual(defined);
  });

  for (const code of codes) {
    const rule = closeRule(code);
    it(`${code} → ${rule.action}${rule.outcome ? ` (${rule.outcome})` : ""}`, async () => {
      const h = harness();
      h.client.connect();
      await flush();
      h.sockets[0]!.open();
      h.sockets[0]!.closeWith(code);
      await flush();

      if (rule.action === "stop") {
        const state = h.client.getState();
        expect(state.status).toBe("closed");
        expect(state.outcome).toBe(rule.outcome);
        const shown = consoleStatus(state, null);
        expect(shown.pill).toBe("refused");
        expect(shown.detail).toBe(STOPPED[rule.outcome!][1]);
        await jest.advanceTimersByTimeAsync(120_000);
        expect(h.sockets).toHaveLength(1); // never a reconnect loop
        return;
      }

      if (rule.action === "reauth") {
        // One retry with a fresh token; refused again before any welcome = signed out, for good.
        expect(h.client.getState().status).not.toBe("closed");
        await jest.advanceTimersByTimeAsync(60_000);
        await flush();
        expect(h.sockets.length).toBe(2);
        h.sockets[1]!.open();
        h.sockets[1]!.closeWith(code);
        await flush();
        const state = h.client.getState();
        expect(state.status).toBe("closed");
        expect(state.outcome).toBe("signed_out");
        expect(consoleStatus(state, null).detail).toBe("Signed out — sign in again");
        await jest.advanceTimersByTimeAsync(120_000);
        expect(h.sockets).toHaveLength(2);
        return;
      }

      // reconnect / reconnect_now: the console says Reconnecting…, and the client dials again.
      const state = h.client.getState();
      expect(state.outcome).toBeNull();
      expect(consoleStatus(state, null).pill).not.toBe("refused");
      await jest.advanceTimersByTimeAsync(60_000);
      await flush();
      expect(h.sockets.length).toBeGreaterThan(1);
      h.client.close();
    });
  }
});
