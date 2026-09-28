/** @jest-environment node */

import {
  WALK_CAP_HEADER,
  createWalkKnobReader,
  decideWalkAdmission,
  walkCapDevEndpoint,
  walkCapGateForRequest,
  scheduleWalkIdleExpiryForTest,
  setWalkCapTestState,
  walkCapGate,
  type WalkRegistry,
  type WalkKnobs,
} from "./walkCap";

const MIN = 60_000;
const KNOBS: WalkKnobs = { cap: 4, windowMinutes: 10 };
const T0 = 1_800_000_000_000;

function registryWith(entries: Array<[string, number]>) {
  return { admitted: new Map<string, number>(entries), evicted: new Set<string>() } satisfies WalkRegistry;
}

describe("decideWalkAdmission — the live-database walk cap", () => {
  it("admits a new host while under the cap and records it", () => {
    const registry = registryWith([["a.localhost:3001", T0]]);
    const decision = decideWalkAdmission(registry, "b.localhost:3001", T0, KNOBS);
    expect(decision.verdict).toBe("admit");
    expect(decision.verdict === "admit" && decision.newlyAdmitted).toBe(true);
    expect(registry.admitted.has("b.localhost:3001")).toBe(true);
  });

  it("at the cap evicts the exact least-recently-used host and admits a new one", () => {
    const registry = registryWith([
      ["a.localhost:3001", T0 - 1 * MIN],
      ["b.localhost:3001", T0 - 2 * MIN],
      ["c.localhost:3001", T0 - 3 * MIN],
      ["d.localhost:3001", T0 - 4 * MIN],
    ]);
    const decision = decideWalkAdmission(registry, "e.localhost:3001", T0, KNOBS);
    expect(decision.verdict).toBe("admit");
    expect(decision.active.map((w) => w.host)).toEqual([
      "e.localhost:3001",
      "a.localhost:3001",
      "b.localhost:3001",
      "c.localhost:3001",
    ]);
    expect(decision.active[3].idleMs).toBe(3 * MIN);
    expect(decision.evicted).toEqual(["d.localhost:3001"]);
    expect(registry.evicted.has("d.localhost:3001")).toBe(true);
    expect(registry.admitted.has("e.localhost:3001")).toBe(true);
  });

  it("breaks equal LRU timestamps by insertion order", () => {
    const registry = registryWith([
      ["first.localhost:3001", T0],
      ["second.localhost:3001", T0],
      ["third.localhost:3001", T0],
      ["fourth.localhost:3001", T0],
    ]);
    const decision = decideWalkAdmission(registry, "new.localhost:3001", T0, KNOBS);
    expect(decision.evicted).toEqual(["first.localhost:3001"]);
  });

  it("an explicit user activity touch keeps a host ahead of background requests", () => {
    const registry = registryWith([
      ["quiet.localhost:3001", T0 - 4 * MIN],
      ["active.localhost:3001", T0 - 3 * MIN],
      ["c.localhost:3001", T0 - 2 * MIN],
      ["d.localhost:3001", T0 - MIN],
    ]);
    decideWalkAdmission(registry, "active.localhost:3001", T0, KNOBS, "activity");
    decideWalkAdmission(registry, "quiet.localhost:3001", T0 + MIN, KNOBS, "background");
    const decision = decideWalkAdmission(registry, "new.localhost:3001", T0 + MIN, KNOBS);
    expect(decision.evicted).toEqual(["quiet.localhost:3001"]);
  });

  it("lowers a cap by evicting LRU and tombstones evicted hosts against auto reclaim", () => {
    const registry = registryWith([
      ["a.localhost:3001", T0 - 4 * MIN],
      ["b.localhost:3001", T0 - 3 * MIN],
      ["c.localhost:3001", T0 - 2 * MIN],
      ["d.localhost:3001", T0 - MIN],
    ]);
    const decision = decideWalkAdmission(registry, "d.localhost:3001", T0, { cap: 2, windowMinutes: 10 }, "document");
    expect(decision.evicted).toEqual(["a.localhost:3001", "b.localhost:3001"]);
    expect(decideWalkAdmission(registry, "a.localhost:3001", T0 + MIN, KNOBS, "background").verdict).toBe("parked");
  });

  it("at the cap still re-admits a host that is already admitted, refreshing its last-seen", () => {
    const registry = registryWith([
      ["a.localhost:3001", T0 - 1 * MIN],
      ["b.localhost:3001", T0 - 2 * MIN],
      ["c.localhost:3001", T0 - 3 * MIN],
      ["d.localhost:3001", T0 - 9 * MIN],
    ]);
    const decision = decideWalkAdmission(registry, "d.localhost:3001", T0, KNOBS);
    expect(decision.verdict).toBe("admit");
    expect(decision.verdict === "admit" && decision.newlyAdmitted).toBe(false);
    expect(registry.admitted.get("d.localhost:3001")).toBe(T0);
  });

  it("a host idle past the window frees its slot", () => {
    const registry = registryWith([
      ["a.localhost:3001", T0 - 1 * MIN],
      ["b.localhost:3001", T0 - 2 * MIN],
      ["c.localhost:3001", T0 - 3 * MIN],
      ["stale.localhost:3001", T0 - 11 * MIN],
    ]);
    const decision = decideWalkAdmission(registry, "e.localhost:3001", T0, KNOBS);
    expect(decision.verdict).toBe("admit");
    expect(registry.admitted.has("stale.localhost:3001")).toBe(false);
    expect(registry.evicted.has("stale.localhost:3001")).toBe(true);
    expect(registry.admitted.has("e.localhost:3001")).toBe(true);
  });

  it("cap 0 refuses every host, even one seen before", () => {
    const registry = registryWith([["a.localhost:3001", T0 - MIN]]);
    const knobs = { cap: 0, windowMinutes: 10 };
    expect(decideWalkAdmission(registryWith([]), "x.localhost:3001", T0, knobs).verdict).toBe("refuse");
    expect(decideWalkAdmission(registry, "a.localhost:3001", T0, knobs).verdict).toBe("refuse");
  });
});

describe("createWalkKnobReader — one fetch, 60s cache, a missing knob screams", () => {
  const rows = [
    { key: "production_concurrent_cap", value: 4 },
    { key: "activity_window_minutes", value: 10 },
  ];

  function fakeFetch(body: unknown, status = 200) {
    return jest.fn(async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
  }

  it("reads both knobs in ONE request and caches them for 60s", async () => {
    let now = T0;
    const fetchImpl = fakeFetch(rows);
    const read = createWalkKnobReader({
      fetchImpl,
      restUrl: "https://db.matrxserver.com",
      apiKey: "k",
      now: () => now,
      log: jest.fn(),
    });
    await expect(Promise.all([read(), read()])).resolves.toEqual([KNOBS, KNOBS]);
    now += 59_000;
    await read();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 2_000;
    await read();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/rest/v1/feature_knob?");
    expect(url).toContain("feature=eq.ops.agent_walks");
    expect((init.headers as Record<string, string>)["Accept-Profile"]).toBe("platform");
  });

  it("a missing knob returns null and screams with the remedy", async () => {
    const log = jest.fn();
    const read = createWalkKnobReader({
      fetchImpl: fakeFetch([rows[1]]),
      restUrl: "https://db.matrxserver.com",
      apiKey: "k",
      now: () => T0,
      log,
    });
    await expect(read()).resolves.toBeNull();
    const scream = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(scream).toMatch(/ops\.agent_walks production_concurrent_cap/);
    expect(scream).toMatch(/FAILING OPEN/);
    expect(scream).toMatch(/ops_agent_walks_production_cap_2026_09_26\.sql/);
  });
});

describe("walkCapGate — development against production only", () => {
  const devEnv = {
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: "https://db.matrxserver.com",
  };

  function gateInput(overrides: Partial<Parameters<typeof walkCapGate>[0]> = {}) {
    const registry = registryWith([
      ["a.localhost:3001", T0],
      ["b.localhost:3001", T0],
      ["c.localhost:3001", T0],
      ["d.localhost:3001", T0],
    ]);
    return {
      host: "e.localhost:3001",
      env: devEnv,
      readKnobs: jest.fn(async () => KNOBS),
      registry,
      now: T0 + MIN,
      log: jest.fn(),
      ...overrides,
    };
  }

  it("admits the 5th host by evicting the oldest active walk", async () => {
    const log = jest.fn();
    const input = gateInput({ log });
    const response = await walkCapGate(input);
    expect(response).toBeNull();
    expect(input.registry.evicted.has("a.localhost:3001")).toBe(true);
    expect(input.registry.admitted.has("e.localhost:3001")).toBe(true);
    expect(String(log.mock.calls.map((call) => call[0]).join("\n"))).toMatch(/EVICTED a\.localhost:3001/);
  });

  it("a missing knob fails OPEN — the walk proceeds", async () => {
    const input = gateInput({ readKnobs: jest.fn(async () => null) });
    await expect(walkCapGate(input)).resolves.toBeNull();
  });

  it("NODE_ENV production never evaluates the gate — no knob read, no registry touch", async () => {
    const input = gateInput({ env: { ...devEnv, NODE_ENV: "production" } });
    await expect(walkCapGate(input)).resolves.toBeNull();
    expect(input.readKnobs).not.toHaveBeenCalled();
    expect(input.registry.admitted.size).toBe(4);
  });

  it("a development server pointed at the clone is never capped", async () => {
    const input = gateInput({
      env: { ...devEnv, NEXT_PUBLIC_SUPABASE_URL: "https://hykobnqyuxspbcijrodb.supabase.co" },
    });
    await expect(walkCapGate(input)).resolves.toBeNull();
    expect(input.readKnobs).not.toHaveBeenCalled();
  });
});

describe("walk-cap dev endpoint framing and safe parking", () => {
  const originalEnv = { ...process.env };
  let nowSpy: jest.SpyInstance;
  let endpointState: { registry: WalkRegistry; listeners: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>; readKnobs: () => Promise<WalkKnobs> };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "https://db.matrxserver.com",
    };
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(T0);
    endpointState = {
      registry: registryWith([]),
      listeners: new Map(),
      readKnobs: async () => KNOBS,
    };
    setWalkCapTestState(endpointState);
  });

  afterEach(() => {
    setWalkCapTestState(undefined);
    nowSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  it("writes a real SSE frame and status reads do not admit a host", async () => {
    const response = await walkCapDevEndpoint(new Request("http://frame.localhost:3001/__dev-walk?stream=1", { headers: { host: "frame.localhost:3001" } }));
    if (!response?.body) throw new Error("expected an SSE stream");
    const reader = response.body.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("event: state\ndata: {}\n\n");
    await reader.cancel();
    expect(endpointState.listeners.has("frame.localhost:3001")).toBe(false);
  });

  it("parks with an escaped, same-origin-only return target", async () => {
    const response = await walkCapDevEndpoint(new Request("http://frame.localhost:3001/__dev-walk?parked=1&returnTo=%2F%5Cevil", { headers: { host: "frame.localhost:3001" } }));
    const html = await response?.text();
    expect(html).toContain('value="/"');
    expect(html).toContain("font:16px/1.5 system-ui");
  });

  it("does not let status or unknown activity create an admission", async () => {
    const activity = await walkCapDevEndpoint(new Request("http://frame.localhost:3001/__dev-walk?activity=1", {
      method: "POST",
      headers: { host: "frame.localhost:3001", origin: "http://frame.localhost:3001" },
    }));
    expect(activity?.status).toBe(204);
    const stream = await walkCapDevEndpoint(new Request("http://frame.localhost:3001/__dev-walk?stream=1", { headers: { host: "frame.localhost:3001" } }));
    expect(stream?.status).toBe(200);
  });

  it("returns the eviction signal for a tombstoned activity host, while unknown activity stays a no-op", async () => {
    endpointState.registry.evicted.add("old.localhost:3001");
    const tombstoned = await walkCapDevEndpoint(new Request("http://old.localhost:3001/__dev-walk?activity=1", {
      method: "POST", headers: { host: "old.localhost:3001", origin: "http://old.localhost:3001" },
    }));
    const unknown = await walkCapDevEndpoint(new Request("http://new.localhost:3001/__dev-walk?activity=1", {
      method: "POST", headers: { host: "new.localhost:3001", origin: "http://new.localhost:3001" },
    }));
    expect(tombstoned?.status).toBe(409);
    expect(tombstoned?.headers.get(WALK_CAP_HEADER)).toBe("evicted");
    expect(unknown?.status).toBe(204);
  });

  it("notifies every same-host stream on LRU eviction and never lets it reacquire automatically", async () => {
    const registry = registryWith([
      ["old.localhost:3001", T0 - 4 * MIN], ["b.localhost:3001", T0 - 3 * MIN],
      ["c.localhost:3001", T0 - 2 * MIN], ["d.localhost:3001", T0 - MIN],
    ]);
    setWalkCapTestState({ registry, listeners: new Map(), readKnobs: async () => KNOBS });
    const streams = await Promise.all([1, 2].map(() => walkCapDevEndpoint(new Request("http://old.localhost:3001/__dev-walk?stream=1", { headers: { host: "old.localhost:3001" } }))));
    const readers = streams.map((response) => response?.body?.getReader());
    await Promise.all(readers.map((reader) => reader?.read()));
    await walkCapGateForRequest("new.localhost:3001", "document");
    const frames = await Promise.all(readers.map(async (reader) => new TextDecoder().decode((await reader?.read())?.value)));
    expect(frames).toEqual(["event: evicted\ndata: {}\n\n", "event: evicted\ndata: {}\n\n"]);
    expect(await walkCapGateForRequest("old.localhost:3001", "background")).toMatchObject({ status: 409 });
  });

  it("resumes only a tombstoned host and evicts the next LRU host", async () => {
    const registry = registryWith([
      ["a.localhost:3001", T0 - 4 * MIN], ["b.localhost:3001", T0 - 3 * MIN],
      ["c.localhost:3001", T0 - 2 * MIN], ["d.localhost:3001", T0 - MIN],
    ]);
    registry.evicted.add("returning.localhost:3001");
    setWalkCapTestState({ registry, listeners: new Map(), readKnobs: async () => KNOBS });
    const response = await walkCapDevEndpoint(new Request("http://returning.localhost:3001/__dev-walk", {
      method: "POST", headers: { host: "returning.localhost:3001", origin: "http://returning.localhost:3001", "content-type": "application/x-www-form-urlencoded" }, body: "returnTo=%2Fnotes",
    }));
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe("http://returning.localhost:3001/notes");
    expect(registry.evicted.has("a.localhost:3001")).toBe(true);
  });

  it("rejects malformed or normalized-host origin spoofing", async () => {
    const malformed = await walkCapDevEndpoint(new Request("http://frame.localhost:3001/__dev-walk?activity=1", {
      method: "POST", headers: { host: "frame.localhost:3001", origin: "not a url" },
    }));
    const wrongHost = await walkCapDevEndpoint(new Request("http://localhost:3001/__dev-walk?activity=1", {
      method: "POST", headers: { host: "frame.localhost:3001", origin: "http://localhost:3001" },
    }));
    expect(malformed?.status).toBe(403);
    expect(wrongHost?.status).toBe(403);
  });

  it("cap zero shuts every admitted host down into tombstones", () => {
    const registry = registryWith([["a.localhost:3001", T0], ["b.localhost:3001", T0]]);
    const decision = decideWalkAdmission(registry, "a.localhost:3001", T0, { cap: 0, windowMinutes: 10 });
    expect(decision.evicted).toEqual(["a.localhost:3001", "b.localhost:3001"]);
    expect(registry.evicted).toEqual(new Set(["a.localhost:3001", "b.localhost:3001"]));
  });
});

describe("process-global idle expiry", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    setWalkCapTestState(undefined);
  });

  it("expires the earliest host, then reschedules after an explicit touch", () => {
    jest.setSystemTime(T0);
    const registry = registryWith([
      ["a.localhost:3001", T0],
      ["b.localhost:3001", T0 + MIN],
    ]);
    setWalkCapTestState({ registry, listeners: new Map(), readKnobs: async () => KNOBS });
    scheduleWalkIdleExpiryForTest(KNOBS);
    jest.advanceTimersByTime(9 * MIN);
    decideWalkAdmission(registry, "a.localhost:3001", T0 + 9 * MIN, KNOBS, "activity");
    scheduleWalkIdleExpiryForTest(KNOBS);
    jest.advanceTimersByTime(2 * MIN + 2);
    expect(registry.evicted.has("b.localhost:3001")).toBe(true);
    expect(registry.admitted.has("a.localhost:3001")).toBe(true);
    jest.advanceTimersByTime(8 * MIN + 1);
    expect(registry.evicted.has("a.localhost:3001")).toBe(true);
  });

  it("cleans up without leaving a timer once no admitted hosts remain", () => {
    jest.setSystemTime(T0);
    const registry = registryWith([["a.localhost:3001", T0]]);
    const state = { registry, listeners: new Map(), readKnobs: async () => KNOBS };
    setWalkCapTestState(state);
    scheduleWalkIdleExpiryForTest(KNOBS);
    jest.advanceTimersByTime(10 * MIN + 1);
    expect(registry.admitted.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("walkCapGate refusal page — names the way out", () => {
  it("a refused walk is told to use the clone preview, which now exists", async () => {
    const response = await walkCapGate({
      host: "late.localhost:3001",
      env: { NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://db.matrxserver.com" },
      readKnobs: jest.fn(async () => ({ cap: 0, windowMinutes: 10 })),
      registry: registryWith([]),
      now: T0,
      log: jest.fn(),
    });
    expect(response?.status).toBe(503);
    const html = (await response?.text()) ?? "";
    expect(html).toContain("pnpm preview:start --clone");
    expect(html).toContain("pnpm dev-login --clone");
    expect(html).not.toMatch(/not built|waiting is the only path/);
  });
});
