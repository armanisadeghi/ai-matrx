// SERVER ROWS ARE OFF UNLESS THE PERSON'S KNOB SAYS ON (lane SSR-ROWS-2).
//
// A table page draws its rows in the server's HTML only when the person's knob `data/server_rows`,
// carried by the table's own bundle (`serverRowsOf`), says on — decided at no extra read. No
// organization, a bundle without the knob, a non-true value or a gate slower than the cap are all
// OFF, and an off page never asks the grid's first page on the server. The cap is the person's
// `data/server_rows_cap_ms`. RED before: the gate was a separate read (`table_page_server_rows`).

jest.mock("server-only", () => ({}), { virtual: true });

let mockWhere: unknown = null;
let mockKnob: unknown = null;
let mockHang = false;
let mockDelayMs = 0;
const mockAsked: string[] = [];
const mockRowsAsked: boolean[] = [];
const mockStarted: Array<{ name: string; at: number }> = [];
let mockClaimsDelayMs = 0;

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    schema: () => ({
      rpc: (fn: string) => {
        mockAsked.push(fn);
        mockStarted.push({ name: fn, at: Date.now() });
        if (mockHang) return new Promise(() => {});
        if (fn === "where_id_opens")
          return new Promise((resolve) => (mockDelayMs ? setTimeout(() => resolve({ data: mockWhere, error: null }), mockDelayMs) : resolve({ data: mockWhere, error: null })));
        return Promise.resolve({ data: null, error: { message: `unexpected ${fn}` } });
      },
    }),
  }),
}));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: () => {
    mockStarted.push({ name: "claims", at: Date.now() });
    const answer = { data: { user: { id: "87a6e699-3622-4869-8843-d0867456c0dd" } } };
    return new Promise((resolve) => (mockClaimsDelayMs ? setTimeout(() => resolve(answer), mockClaimsDelayMs) : resolve(answer)));
  },
}));
jest.mock("@ai-matrx/records-ui/first-page", () => ({
  serverRowsOf: (seed: { answers: Array<{ door: string; data: { on?: unknown; cap_ms?: unknown } }> }) => {
    const found = seed.answers.find((a) => a.door === "server_rows");
    if (!found) return null;
    return { on: found.data.on === true, capMs: typeof found.data.cap_ms === "number" ? found.data.cap_ms : null };
  },
  askTablePageSeed: async ({ rows }: { rows: (asked: unknown) => boolean }) => {
    mockAsked.push("table_page_bundle");
    mockStarted.push({ name: "table_page_bundle", at: Date.now() });
    const asked = { at: Date.now(), answers: mockKnob ? [{ door: "server_rows", args: {}, data: mockKnob }] : [] };
    mockRowsAsked.push(rows(asked));
    return asked;
  },
}));

const ORG = "344cfaa8-2b0c-4971-854a-9694614816f2";
const TABLE = "7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd";

beforeEach(() => {
  mockAsked.length = 0;
  mockRowsAsked.length = 0;
  mockStarted.length = 0;
  mockClaimsDelayMs = 0;
  mockWhere = { kind: "table", organization_id: ORG };
  mockKnob = null;
  mockHang = false;
  mockDelayMs = 0;
});

async function read(options: { rows?: boolean; forceOn?: boolean } = {}) {
  const { readTablePage } = await import("../tablePageSeed.server");
  const reads = readTablePage(TABLE, null, options);
  return { gate: await reads.gate, seed: await reads.seed };
}

it("the person's knob in the bundle says on: rows asked, within the person's cap, at no extra read", async () => {
  mockKnob = { on: true, cap_ms: 1500 };
  const { gate, seed } = await read();
  expect(gate).toEqual({ on: true, capMs: 1500 });
  expect(mockRowsAsked).toEqual([true]);
  expect(seed?.organizationId).toBe(ORG);
  expect(mockAsked).toEqual(["where_id_opens", "table_page_bundle"]);
});

it("the knob says off: no rows asked on the server", async () => {
  mockKnob = { on: false, cap_ms: 900 };
  expect((await read()).gate.on).toBe(false);
  expect(mockRowsAsked).toEqual([false]);
});

it("a bundle without the knob: off", async () => {
  expect((await read()).gate).toEqual({ on: false, capMs: 1200 });
  expect(mockRowsAsked).toEqual([false]);
});

it("the table opens for nobody here: off, and no bundle asked", async () => {
  mockWhere = null;
  expect((await read()).gate.on).toBe(false);
  expect(mockAsked).toEqual(["where_id_opens"]);
});

it("a value other than true is off", async () => {
  mockKnob = { on: "true", cap_ms: 900 };
  expect((await read()).gate.on).toBe(false);
});

it("an address that opens elsewhere asks no rows even when on", async () => {
  mockKnob = { on: true, cap_ms: 900 };
  await read({ rows: false });
  expect(mockRowsAsked).toEqual([false]);
});

it("a development request may force it on", async () => {
  mockKnob = { on: false, cap_ms: 900 };
  expect((await read({ forceOn: true })).gate.on).toBe(true);
  expect(mockRowsAsked).toEqual([true]);
});

it("A 4 s STORE: the gate and the seed answer off / no seed at the cap (1.2 s), never after it", async () => {
  jest.useFakeTimers();
  try {
    mockKnob = { on: true, cap_ms: 1200 };
    mockDelayMs = 4000; // where_id_opens answers after 4 s: a cold chain
    const { readTablePage } = await import("../tablePageSeed.server");
    const reads = readTablePage(TABLE);
    let seedAt: number | null = null;
    let seedValue: unknown = "pending";
    const t0 = Date.now();
    void reads.seed.then((v) => {
      seedAt = Date.now() - t0;
      seedValue = v;
    });
    await jest.advanceTimersByTimeAsync(1199);
    expect(seedValue).toBe("pending");
    await jest.advanceTimersByTimeAsync(1);
    expect(seedValue).toBeNull(); // "no seed": the browser asks for itself at once
    expect(seedAt).toBe(1200);
    await expect(reads.gate).resolves.toEqual({ on: false, capMs: 1200 });
    // the store answering later changes nothing that was streamed
    await jest.advanceTimersByTimeAsync(4000);
    await expect(reads.seed).resolves.toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it("a store that never answers: off and no seed at the cap — the old 8 s hang guard is gone", async () => {
  jest.useFakeTimers();
  try {
    mockHang = true;
    const { readTablePage } = await import("../tablePageSeed.server");
    const reads = readTablePage(TABLE);
    await jest.advanceTimersByTimeAsync(1200);
    await expect(reads.gate).resolves.toEqual({ on: false, capMs: 1200 });
    await expect(reads.seed).resolves.toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it("a warm store inside the cap streams its seed", async () => {
  jest.useFakeTimers();
  try {
    mockKnob = { on: true, cap_ms: 1200 };
    mockDelayMs = 300;
    const { readTablePage } = await import("../tablePageSeed.server");
    const reads = readTablePage(TABLE);
    await jest.advanceTimersByTimeAsync(300);
    await expect(reads.seed).resolves.toMatchObject({ organizationId: ORG });
    await expect(reads.gate).resolves.toEqual({ on: true, capMs: 1200 });
  } finally {
    jest.useRealTimers();
  }
});

it("PARALLEL START: where the table lives and who is asking begin together, and the bundle starts the moment the organization is known", async () => {
  jest.useFakeTimers();
  try {
    mockKnob = { on: true, cap_ms: 1200 };
    mockDelayMs = 200;
    mockClaimsDelayMs = 150;
    const { readTablePage } = await import("../tablePageSeed.server");
    const t0 = Date.now();
    const reads = readTablePage(TABLE);
    await jest.advanceTimersByTimeAsync(400);
    await reads.seed;
    const at = (name: string) => (mockStarted.find((x) => x.name === name)?.at ?? NaN) - t0;
    expect(at("where_id_opens")).toBeLessThan(50);
    expect(at("claims")).toBeLessThan(50);
    expect(Math.abs(at("where_id_opens") - at("claims"))).toBeLessThan(50);
    // the bundle waits only for the organization (200 ms), never for the session behind it
    expect(at("table_page_bundle")).toBeGreaterThanOrEqual(200);
    expect(at("table_page_bundle")).toBeLessThan(250);
  } finally {
    jest.useRealTimers();
  }
});

it("THE OPENING IS NEVER CAPPED: a store slower than the cap still streams where + bundle for the browser's reads", async () => {
  jest.useFakeTimers();
  try {
    mockKnob = { on: true, cap_ms: 1200 };
    mockDelayMs = 4000;
    const { readTablePage } = await import("../tablePageSeed.server");
    const reads = readTablePage(TABLE);
    await jest.advanceTimersByTimeAsync(1200);
    await expect(reads.seed).resolves.toBeNull();
    await jest.advanceTimersByTimeAsync(2800);
    await expect(reads.opening).resolves.toMatchObject({ organizationId: ORG });
  } finally {
    jest.useRealTimers();
  }
});

export {};
