import { SandboxProcessAdapter } from "./SandboxProcessAdapter";
import { TextDecoder } from "node:util";

describe("SandboxProcessAdapter.stream", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects a 200 SSE response that completes with zero events", async () => {
    Object.defineProperty(globalThis, "TextDecoder", {
      configurable: true,
      value: TextDecoder,
    });
    const reader = { read: jest.fn().mockResolvedValue({ done: true }) };
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: { getReader: () => reader },
    } as unknown as Response);

    const adapter = new SandboxProcessAdapter("row-id");
    const onEvent = jest.fn();

    await expect(adapter.stream("pnpm install", onEvent)).rejects.toThrow(
      "HTTP 200 with no events",
    );
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe("SandboxProcessAdapter.openPty", () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
  });

  it("waits for open and uses the daemon's raw-input control protocol", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "short-lived-token",
        ws_base: "wss://orchestrator.example",
        sandbox_id: "sbx-real",
      }),
    } as Response);

    class MockWebSocket {
      static readonly OPEN = 1;
      readonly sent: string[] = [];
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(readonly url: string) {
        sockets.push(this);
      }
      send(value: string) {
        this.sent.push(value);
      }
      close() {}
    }
    const sockets: MockWebSocket[] = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    const adapter = new SandboxProcessAdapter("row-id");
    let resolved = false;
    const pending = adapter.openPty({
      onData: jest.fn(),
    });
    pending.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    sockets[0]?.onopen?.();
    const handle = await pending;
    handle.write("echo hello\r");
    handle.resize(100, 40);
    handle.signal("SIGINT");

    expect(sockets[0]?.sent).toEqual([
      "echo hello\r",
      JSON.stringify({ type: "resize", cols: 100, rows: 40 }),
      JSON.stringify({ type: "signal", name: "SIGINT" }),
    ]);
  });
});
