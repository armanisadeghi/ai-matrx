import {
  discoverLocalEngine,
  getCachedLocalEngine,
  __resetLocalEngineCacheForTests,
  LOCAL_ENGINE_PORT_START,
  LOCAL_ENGINE_PORT_COUNT,
} from "../discovery";

function mockFetchEngineOn(port: number, version = "1.4.0"): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `http://127.0.0.1:${port}/health`) {
      return {
        ok: true,
        json: async () => ({ status: "ok", version }),
      } as unknown as Response;
    }
    throw new Error("connection refused");
  });
}

describe("local-engine discovery", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    __resetLocalEngineCacheForTests();
    jest.restoreAllMocks();
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
