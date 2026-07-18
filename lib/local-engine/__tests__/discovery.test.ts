import {
  discoverLocalEngine,
  getCachedLocalEngine,
  __resetLocalEngineCacheForTests,
  LOCAL_ENGINE_PORT_START,
  LOCAL_ENGINE_PORT_COUNT,
  supportsLocalAgentExecution,
} from "../discovery";

function mockFetchEngineOn(port: number, version = "1.4.0"): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `http://127.0.0.1:${port}/health`) {
      return {
        ok: true,
        json: async () => ({
          service: "matrx-local",
          status: "ok",
          version,
          capabilities: ["agent_execution_v1"],
        }),
      } as unknown as Response;
    }
    throw new Error("connection refused");
  });
}

describe("local-engine discovery", () => {
  const realFetch = global.fetch;
  const realOverride = process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL;

  afterEach(() => {
    global.fetch = realFetch;
    if (realOverride === undefined) {
      delete process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL = realOverride;
    }
    __resetLocalEngineCacheForTests();
    jest.restoreAllMocks();
  });

  it("uses the explicit loopback engine in development without scanning", async () => {
    process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL = "http://127.0.0.1:22240/";
    const fetchMock = mockFetchEngineOn(22240, "dev-build");
    global.fetch = fetchMock as unknown as typeof fetch;

    const found = await discoverLocalEngine({ force: true });

    expect(found?.baseUrl).toBe("http://127.0.0.1:22240");
    expect(found?.version).toBe("dev-build");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an explicit override whose health response is not matrx-local", async () => {
    process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL = "http://127.0.0.1:22240";
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ service: "other-service", status: "ok" }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await discoverLocalEngine({ force: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores the development override in production", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production");
    process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL = "http://127.0.0.1:22240";
    const port = LOCAL_ENGINE_PORT_START + 4;
    const fetchMock = mockFetchEngineOn(port);
    global.fetch = fetchMock as unknown as typeof fetch;

    const found = await discoverLocalEngine({ force: true });

    expect(found?.port).toBe(port);
    expect(fetchMock).toHaveBeenCalledTimes(LOCAL_ENGINE_PORT_COUNT);
  });

  it("ignores a non-loopback development override and scans normally", async () => {
    process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL = "https://example.com:22240";
    const port = LOCAL_ENGINE_PORT_START + 2;
    const fetchMock = mockFetchEngineOn(port);
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const found = await discoverLocalEngine({ force: true });

    expect(found?.port).toBe(port);
    expect(fetchMock).toHaveBeenCalledTimes(LOCAL_ENGINE_PORT_COUNT);
  });

  it("finds the engine on the scan range and caches it for sync reads", async () => {
    const port = LOCAL_ENGINE_PORT_START + 3;
    const fetchMock = mockFetchEngineOn(port);
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(getCachedLocalEngine()).toBeNull();

    const found = await discoverLocalEngine();
    expect(found).not.toBeNull();
    expect(found?.baseUrl).toBe(`http://127.0.0.1:${port}`);
    expect(found?.port).toBe(port);
    expect(found?.version).toBe("1.4.0");
    expect(found?.capabilities).toContain("agent_execution_v1");
    expect(found && supportsLocalAgentExecution(found)).toBe(true);

    // Sync cache read — this is what resolveBackendForConversation uses.
    const cached = getCachedLocalEngine();
    expect(cached?.baseUrl).toBe(`http://127.0.0.1:${port}`);

    // The full range was probed exactly once.
    expect(fetchMock).toHaveBeenCalledTimes(LOCAL_ENGINE_PORT_COUNT);

    // A second discover within the positive TTL is a cache hit — no fetches.
    fetchMock.mockClear();
    const again = await discoverLocalEngine();
    expect(again?.port).toBe(port);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not infer saved-agent execution support from reachability", () => {
    expect(
      supportsLocalAgentExecution({
        baseUrl: "http://127.0.0.1:22140",
        port: 22140,
        version: "legacy",
        capabilities: [],
        discoveredAt: Date.now(),
      }),
    ).toBe(false);
  });

  it("returns null (and caches the miss) when no engine responds", async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error("connection refused");
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const found = await discoverLocalEngine();
    expect(found).toBeNull();
    expect(getCachedLocalEngine()).toBeNull();

    // Negative cooldown: an immediate retry does not rescan.
    fetchMock.mockClear();
    const retry = await discoverLocalEngine();
    expect(retry).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    // force bypasses the cooldown.
    const forced = await discoverLocalEngine({ force: true });
    expect(forced).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(LOCAL_ENGINE_PORT_COUNT);
  });
});
