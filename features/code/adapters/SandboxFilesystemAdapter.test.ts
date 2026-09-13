import { SandboxFilesystemAdapter } from "./SandboxFilesystemAdapter";
import { invalidationPathsForWatchEvent } from "../views/explorer/FileTreeWatcher";

class MockWebSocket {
  static readonly OPEN = 1;
  readonly url: string;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  close() {
    this.onclose?.();
  }
}

const sockets: MockWebSocket[] = [];
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("SandboxFilesystemAdapter.watch", () => {
  beforeEach(() => {
    sockets.length = 0;
    jest.useFakeTimers();
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
  });

  it("uses a newly minted direct fs.watch credential after a close and announces a resync", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "first-token",
          ws_base: "wss://orchestrator.example",
          sandbox_id: "sbx-direct",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "renewed-token",
          ws_base: "wss://orchestrator.example",
          sandbox_id: "sbx-direct",
        }),
      }) as unknown as typeof fetch;
    const received: string[] = [];
    const adapter = new SandboxFilesystemAdapter("owned-row");
    const dispose = adapter.watch("/home/agent", (event) => received.push(event.type));

    await flushPromises();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/sandbox/owned-row/access-tokens",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ scopes: ["fs.watch"], single_use: false }),
      }),
    );
    expect(sockets[0]?.url).toContain(
      "wss://orchestrator.example/sandboxes/sbx-direct/fs/watch?",
    );
    expect(sockets[0]?.url).toContain("access_token=first-token");
    expect(sockets[0]?.url).not.toContain("/api/sandbox/");

    sockets[0]?.onopen?.();
    expect(received).toEqual(["resync"]);

    sockets[0]?.onclose?.();
    jest.advanceTimersByTime(1500);
    await flushPromises();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(sockets[1]?.url).toContain("access_token=renewed-token");
    sockets[1]?.onopen?.();
    expect(received).toEqual(["resync", "resync"]);

    dispose();
  });

  it("does not open or reconnect after disposal while its credential mint is pending", async () => {
    let resolveMint: ((value: Response) => void) | undefined;
    let mintSignal: AbortSignal | undefined;
    globalThis.fetch = jest.fn(
      (_url, init?: RequestInit) => {
        mintSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => { resolveMint = resolve; });
      },
    ) as unknown as typeof fetch;
    const adapter = new SandboxFilesystemAdapter("owned-row");
    const dispose = adapter.watch("/home/agent", jest.fn());

    dispose();
    expect(mintSignal?.aborted).toBe(true);
    resolveMint?.({
      ok: true,
      json: async () => ({
        token: "late-token",
        ws_base: "wss://orchestrator.example",
        sandbox_id: "sbx-direct",
      }),
    } as Response);
    await flushPromises();
    jest.advanceTimersByTime(3000);
    await flushPromises();

    expect(sockets).toHaveLength(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("stops after a permanent mint refusal but retries a transient unavailable response", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "recovered-token",
          ws_base: "wss://orchestrator.example",
          sandbox_id: "sbx-direct",
        }),
      } as Response) as unknown as typeof fetch;

    const permanent = new SandboxFilesystemAdapter("owned-row");
    const disposePermanent = permanent.watch("/home/agent", jest.fn());
    await flushPromises();
    jest.advanceTimersByTime(5000);
    await flushPromises();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Live file updates unavailable: credential mint was refused (403)"),
    );
    disposePermanent();

    const transient = new SandboxFilesystemAdapter("second-row");
    const disposeTransient = transient.watch("/home/agent", jest.fn());
    await flushPromises();
    jest.advanceTimersByTime(1500);
    await flushPromises();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(sockets).toHaveLength(1);
    disposeTransient();
    consoleError.mockRestore();
  });

  it("refuses a malformed watch credential without opening an unsafe socket", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "token",
        ws_base: "https://not-a-websocket.example",
        sandbox_id: "sbx-direct",
      }),
    } as Response) as unknown as typeof fetch;
    const adapter = new SandboxFilesystemAdapter("owned-row");
    const dispose = adapter.watch("/home/agent", jest.fn());

    await flushPromises();
    expect(sockets).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("credential mint returned an invalid watch endpoint"),
    );
    dispose();
    consoleError.mockRestore();
  });

  it("keeps the watch transport alive when a consumer callback throws", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "watch-token",
        ws_base: "wss://orchestrator.example",
        sandbox_id: "sbx-direct",
      }),
    } as Response) as unknown as typeof fetch;
    const adapter = new SandboxFilesystemAdapter("owned-row");
    const dispose = adapter.watch("/home/agent", () => {
      throw new Error("consumer failed");
    });

    await flushPromises();
    sockets[0]?.onopen?.();
    sockets[0]?.onmessage?.({ data: JSON.stringify({ type: "modified", path: "/home/agent/a.ts" }) });
    expect(consoleError).toHaveBeenCalledTimes(2);
    sockets[0]?.onclose?.();
    jest.advanceTimersByTime(1500);
    await flushPromises();
    expect(sockets).toHaveLength(2);

    dispose();
    consoleError.mockRestore();
  });
});

describe("invalidationPathsForWatchEvent", () => {
  it("includes the root and every mounted nested directory exactly once", () => {
    expect(
      invalidationPathsForWatchEvent({ type: "resync", path: "/home/agent" }, "/home/agent", [
        "/home/agent",
        "/home/agent/src",
        "/home/agent/src/components",
      ]),
    ).toEqual([
      "/home/agent",
      "/home/agent/src",
      "/home/agent/src/components",
    ]);
  });

  it("reloads both directory listings after a cross-directory move", () => {
    expect(
      invalidationPathsForWatchEvent(
        {
          type: "moved",
          path: "/home/agent/destination/file.ts",
          fromPath: "/home/agent/source/file.ts",
        },
        "/home/agent",
        [],
      ),
    ).toEqual(["/home/agent/destination", "/home/agent/source"]);
  });
});
