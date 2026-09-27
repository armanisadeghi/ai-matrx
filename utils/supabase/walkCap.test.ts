/** @jest-environment node */

import {
  WALK_CAP_HEADER,
  createWalkKnobReader,
  decideWalkAdmission,
  walkCapGate,
  type WalkKnobs,
} from "./walkCap";

const MIN = 60_000;
const KNOBS: WalkKnobs = { cap: 4, windowMinutes: 10 };
const T0 = 1_800_000_000_000;

function registryWith(entries: Array<[string, number]>) {
  return new Map<string, number>(entries);
}

describe("decideWalkAdmission — the live-database walk cap", () => {
  it("admits a new host while under the cap and records it", () => {
    const registry = registryWith([["a.localhost:3001", T0]]);
    const decision = decideWalkAdmission(registry, "b.localhost:3001", T0, KNOBS);
    expect(decision.verdict).toBe("admit");
    expect(decision.verdict === "admit" && decision.newlyAdmitted).toBe(true);
    expect(registry.has("b.localhost:3001")).toBe(true);
  });

  it("at the cap refuses a NEW host, and does not record it", () => {
    const registry = registryWith([
      ["a.localhost:3001", T0 - 1 * MIN],
      ["b.localhost:3001", T0 - 2 * MIN],
      ["c.localhost:3001", T0 - 3 * MIN],
      ["d.localhost:3001", T0 - 4 * MIN],
    ]);
    const decision = decideWalkAdmission(registry, "e.localhost:3001", T0, KNOBS);
    expect(decision.verdict).toBe("refuse");
    expect(decision.active.map((w) => w.host)).toEqual([
      "a.localhost:3001",
      "b.localhost:3001",
      "c.localhost:3001",
      "d.localhost:3001",
    ]);
    expect(decision.active[3].idleMs).toBe(4 * MIN);
    expect(registry.has("e.localhost:3001")).toBe(false);
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
    expect(registry.get("d.localhost:3001")).toBe(T0);
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
    expect(registry.has("stale.localhost:3001")).toBe(false);
    expect(registry.has("e.localhost:3001")).toBe(true);
  });

  it("cap 0 refuses every host, even one seen before", () => {
    const registry = registryWith([["a.localhost:3001", T0 - MIN]]);
    const knobs = { cap: 0, windowMinutes: 10 };
    expect(decideWalkAdmission(new Map(), "x.localhost:3001", T0, knobs).verdict).toBe("refuse");
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

  it("answers the 5th host with an honest 503 page and the refusal header, and logs it", async () => {
    const log = jest.fn();
    const input = gateInput({ log });
    const response = await walkCapGate(input);
    if (!response) throw new Error("expected a refusal response");
    expect(response.status).toBe(503);
    expect(response.headers.get(WALK_CAP_HEADER)).toBe("refused");
    const html = await response.text();
    expect(html).toContain("over the live-database walk cap");
    expect(html).toContain("4 agent sessions");
    expect(html).toContain("a.localhost:3001");
    expect(html).toContain("pnpm preview:start --clone");
    expect(String(log.mock.calls[0][0])).toMatch(/REFUSED e\.localhost:3001/);
  });

  it("a missing knob fails OPEN — the walk proceeds", async () => {
    const input = gateInput({ readKnobs: jest.fn(async () => null) });
    await expect(walkCapGate(input)).resolves.toBeNull();
  });

  it("NODE_ENV production never evaluates the gate — no knob read, no registry touch", async () => {
    const input = gateInput({ env: { ...devEnv, NODE_ENV: "production" } });
    await expect(walkCapGate(input)).resolves.toBeNull();
    expect(input.readKnobs).not.toHaveBeenCalled();
    expect(input.registry.size).toBe(4);
  });

  it("a development server pointed at the clone is never capped", async () => {
    const input = gateInput({
      env: { ...devEnv, NEXT_PUBLIC_SUPABASE_URL: "https://hykobnqyuxspbcijrodb.supabase.co" },
    });
    await expect(walkCapGate(input)).resolves.toBeNull();
    expect(input.readKnobs).not.toHaveBeenCalled();
  });
});
