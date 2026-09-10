/** @jest-environment node */
/**
 * The SUT is `discoverLocalEngine` / `getCachedLocalEngine`: which responder
 * counts as the Matrx Local engine, which port wins, how long a result is
 * trusted, and how much probing each call costs. `fetch` (the network) and
 * `Date.now` (the clock) are the only doubles.
 */
import {
  discoverLocalEngine,
  getCachedLocalEngine,
  __resetLocalEngineCacheForTests,
  LOCAL_ENGINE_PORT_START,
  LOCAL_ENGINE_PORT_COUNT,
  supportsLocalAgentExecution,
} from "../discovery";

/**
 * Body shape of matrx-local's `GET /health` (matrx-local app/api/routes.py) —
 * every top-level key the engine sends on a healthy boot.
 */
interface EngineHealthBody {
  status: string;
  health: string;
  service: string;
  version: string;
  instance_id: string | null;
  capabilities: string[];
}

function healthBody(overrides: Partial<EngineHealthBody> = {}): EngineHealthBody {
  return {
    status: "ok",
    health: "ok",
    service: "matrx-local",
    version: "1.4.0",
    instance_id: "hw-7f3a9c",
    capabilities: [
      "chat_execution_v1",
      "conversation_execution_v1",
      "chat_execution_v2",
      "conversation_execution_v2",
      "agent_execution_v1",
      "agent_execution_v2",
    ],
    ...overrides,
  };
}

interface Responder {
  status?: number;
  body: EngineHealthBody | { service: string; status: string };
}

/** A loopback where only the listed base URLs answer; everything else refuses. */
function loopback(responders: Record<string, Responder>) {
  return jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async (input) => {
      const url = String(input);
      const base = url.replace(/\/health$/, "");
      const responder = responders[base];
      if (!responder) throw new TypeError("connection refused");
      return new Response(JSON.stringify(responder.body), {
        status: responder.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
}

const at = (port: number) => `http://127.0.0.1:${port}`;

describe("local-engine discovery", () => {
  const realFetch = global.fetch;
  const realOverride = process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL;
    jest.spyOn(console, "info").mockImplementation(() => undefined);
  });

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
    const fetchMock = loopback({
      [at(22240)]: { body: healthBody({ version: "dev-build" }) },
    });
    global.fetch = fetchMock;

    const found = await discoverLocalEngine({ force: true });

    expect(found?.baseUrl).toBe("http://127.0.0.1:22240");
    expect(found?.version).toBe("dev-build");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an explicit override whose health response is not matrx-local", async () => {
    process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL = "http://127.0.0.1:22240";
    const fetchMock = loopback({
      [at(22240)]: { body: { service: "other-service", status: "ok" } },
    });
    global.fetch = fetchMock;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await discoverLocalEngine({ force: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores the development override in production", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production");
    process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL = "http://127.0.0.1:22240";
    const port = LOCAL_ENGINE_PORT_START + 4;
    const fetchMock = loopback({
      [at(22240)]: { body: healthBody({ version: "dev-build" }) },
      [at(port)]: { body: healthBody() },
    });
    global.fetch = fetchMock;

    const found = await discoverLocalEngine({ force: true });

    expect(found?.port).toBe(port);
    expect(fetchMock).toHaveBeenCalledTimes(LOCAL_ENGINE_PORT_COUNT);
  });

  it("ignores a non-loopback development override and scans normally", async () => {
    process.env.NEXT_PUBLIC_LOCAL_ENGINE_BASE_URL = "https://example.com:22240";
    const port = LOCAL_ENGINE_PORT_START + 2;
    const fetchMock = loopback({ [at(port)]: { body: healthBody() } });
    global.fetch = fetchMock;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const found = await discoverLocalEngine({ force: true });

    expect(found?.port).toBe(port);
    expect(fetchMock).toHaveBeenCalledTimes(LOCAL_ENGINE_PORT_COUNT);
  });

  it("finds the engine on the scan range and caches it for sync reads", async () => {
    const port = LOCAL_ENGINE_PORT_START + 3;
    const fetchMock = loopback({ [at(port)]: { body: healthBody() } });
    global.fetch = fetchMock;

    expect(getCachedLocalEngine()).toBeNull();

    const found = await discoverLocalEngine();
    expect(found?.baseUrl).toBe(`http://127.0.0.1:${port}`);
    expect(found?.port).toBe(port);
    expect(found?.version).toBe("1.4.0");
    expect(found && supportsLocalAgentExecution(found)).toBe(true);

    // Sync cache read — this is what resolveBackendForConversation uses.
    expect(getCachedLocalEngine()?.baseUrl).toBe(`http://127.0.0.1:${port}`);
    expect(fetchMock).toHaveBeenCalledTimes(LOCAL_ENGINE_PORT_COUNT);

    // A second discover within the positive TTL is a cache hit — no fetches.
    fetchMock.mockClear();
    const again = await discoverLocalEngine();
    expect(again?.port).toBe(port);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Break caught: the highest (or any non-lowest) responder winning. The engine
  // takes the FIRST free port, so a second responder higher up is someone else.
  it("picks the lowest responding port when two engines answer", async () => {
    global.fetch = loopback({
      [at(LOCAL_ENGINE_PORT_START + 7)]: { body: healthBody({ version: "high" }) },
      [at(LOCAL_ENGINE_PORT_START + 2)]: { body: healthBody({ version: "low" }) },
    });

    const found = await discoverLocalEngine();

    expect(found?.port).toBe(LOCAL_ENGINE_PORT_START + 2);
    expect(found?.version).toBe("low");
  });

  // Break caught: dropping the `res.ok` check. A lower port answering 503 with
  // an engine-shaped body must lose to the healthy engine above it.
  it("does not accept a non-OK health response as the engine", async () => {
    global.fetch = loopback({
      [at(LOCAL_ENGINE_PORT_START + 1)]: { status: 503, body: healthBody({ version: "broken" }) },
      [at(LOCAL_ENGINE_PORT_START + 5)]: { body: healthBody({ version: "healthy" }) },
    });

    const found = await discoverLocalEngine();

    expect(found?.port).toBe(LOCAL_ENGINE_PORT_START + 5);
    expect(found?.version).toBe("healthy");
  });

  // Break caught: dropping the liveness literal check. A matrx-local that is
  // not reporting status "ok" is not routable.
  it("does not accept a matrx-local whose liveness status is not ok", async () => {
    global.fetch = loopback({
      [at(LOCAL_ENGINE_PORT_START + 1)]: { body: healthBody({ status: "starting", version: "booting" }) },
      [at(LOCAL_ENGINE_PORT_START + 5)]: { body: healthBody({ version: "ready" }) },
    });

    const found = await discoverLocalEngine();

    expect(found?.port).toBe(LOCAL_ENGINE_PORT_START + 5);
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

  // Break caught: trusting a cached engine forever. After the 60s positive TTL
  // the sync read must stop routing streams at an engine nobody re-verified.
  it("stops serving a cached engine from the sync read once its TTL lapses", async () => {
    const t0 = 1_800_000_000_000;
    const now = jest.spyOn(Date, "now").mockReturnValue(t0);
    global.fetch = loopback({ [at(LOCAL_ENGINE_PORT_START + 3)]: { body: healthBody() } });

    await discoverLocalEngine();
    expect(getCachedLocalEngine()?.port).toBe(LOCAL_ENGINE_PORT_START + 3);

    now.mockReturnValue(t0 + 60_001);
    expect(getCachedLocalEngine()).toBeNull();
  });

  // Break caught: a stale positive cache paying a full 20-port rescan (or no
  // probe at all). The cheap path is exactly one re-probe of the known port.
  it("re-verifies a stale engine with a single probe of its own port", async () => {
    const port = LOCAL_ENGINE_PORT_START + 3;
    const t0 = 1_800_000_000_000;
    const now = jest.spyOn(Date, "now").mockReturnValue(t0);
    const fetchMock = loopback({ [at(port)]: { body: healthBody() } });
    global.fetch = fetchMock;

    await discoverLocalEngine();
    fetchMock.mockClear();
    now.mockReturnValue(t0 + 60_001);

    const rechecked = await discoverLocalEngine();

    expect(rechecked?.port).toBe(port);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      `http://127.0.0.1:${port}/health`,
    ]);
  });

  // Break caught: concurrent callers each launching their own scan — every
  // execute/resume thunk warms the cache at once on a turn.
  it("coalesces concurrent discoveries into one scan", async () => {
    const fetchMock = loopback({ [at(LOCAL_ENGINE_PORT_START)]: { body: healthBody() } });
    global.fetch = fetchMock;

    const [a, b] = await Promise.all([discoverLocalEngine(), discoverLocalEngine()]);

    expect(a?.port).toBe(LOCAL_ENGINE_PORT_START);
    expect(b?.port).toBe(LOCAL_ENGINE_PORT_START);
    expect(fetchMock).toHaveBeenCalledTimes(LOCAL_ENGINE_PORT_COUNT);
  });

  it("returns null (and caches the miss) when no engine responds", async () => {
    const fetchMock = loopback({});
    global.fetch = fetchMock;

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
