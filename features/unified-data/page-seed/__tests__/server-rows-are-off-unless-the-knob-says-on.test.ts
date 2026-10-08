// SERVER ROWS ARE OFF UNLESS THE PERSON'S KNOB SAYS ON (lane SSR-ROWS-2).
//
// A table page draws its rows in the server's HTML only when the person's knob `data/server_rows`,
// carried by the table's own bundle (`serverRowsOf`), says on — decided at no extra read. No
// organization, a bundle without the knob, a non-true value or a gate slower than its budget are all
// OFF, and an off page never asks the grid's first page on the server. The budget is the person's
// `data/server_rows_budget_ms`. RED before: the gate was a separate read (`table_page_server_rows`).

jest.mock("server-only", () => ({}), { virtual: true });

let mockWhere: unknown = null;
let mockKnob: unknown = null;
let mockHang = false;
const mockAsked: string[] = [];
const mockRowsAsked: boolean[] = [];

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    schema: () => ({
      rpc: (fn: string) => {
        mockAsked.push(fn);
        if (mockHang) return new Promise(() => {});
        if (fn === "where_id_opens") return Promise.resolve({ data: mockWhere, error: null });
        return Promise.resolve({ data: null, error: { message: `unexpected ${fn}` } });
      },
    }),
  }),
}));
jest.mock("@/utils/supabase/claimsUser", () => ({ getClaimsUser: async () => ({ data: { user: { id: "87a6e699-3622-4869-8843-d0867456c0dd" } } }) }));
jest.mock("@ai-matrx/records-ui/first-page", () => ({
  serverRowsOf: (seed: { answers: Array<{ door: string; data: { on?: unknown; budget_ms?: unknown } }> }) => {
    const found = seed.answers.find((a) => a.door === "server_rows");
    if (!found) return null;
    return { on: found.data.on === true, budgetMs: typeof found.data.budget_ms === "number" ? found.data.budget_ms : null };
  },
  askTablePageSeed: async ({ rows }: { rows: (asked: unknown) => boolean }) => {
    mockAsked.push("table_page_bundle");
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
  mockWhere = { kind: "table", organization_id: ORG };
  mockKnob = null;
  mockHang = false;
});

async function read(options: { rows?: boolean; forceOn?: boolean } = {}) {
  const { readTablePage } = await import("../tablePageSeed.server");
  const reads = readTablePage(TABLE, null, options);
  return { gate: await reads.gate, seed: await reads.seed };
}

it("the person's knob in the bundle says on: rows asked, within the person's budget, at no extra read", async () => {
  mockKnob = { on: true, budget_ms: 6000 };
  const { gate, seed } = await read();
  expect(gate).toEqual({ on: true, budgetMs: 6000 });
  expect(mockRowsAsked).toEqual([true]);
  expect(seed?.organizationId).toBe(ORG);
  expect(mockAsked).toEqual(["where_id_opens", "table_page_bundle"]);
});

it("the knob says off: no rows asked on the server", async () => {
  mockKnob = { on: false, budget_ms: 2500 };
  expect((await read()).gate.on).toBe(false);
  expect(mockRowsAsked).toEqual([false]);
});

it("a bundle without the knob: off", async () => {
  expect((await read()).gate).toEqual({ on: false, budgetMs: 2500 });
  expect(mockRowsAsked).toEqual([false]);
});

it("the table opens for nobody here: off, and no bundle asked", async () => {
  mockWhere = null;
  expect((await read()).gate.on).toBe(false);
  expect(mockAsked).toEqual(["where_id_opens"]);
});

it("a value other than true is off", async () => {
  mockKnob = { on: "true", budget_ms: 2500 };
  expect((await read()).gate.on).toBe(false);
});

it("an address that opens elsewhere asks no rows even when on", async () => {
  mockKnob = { on: true, budget_ms: 2500 };
  await read({ rows: false });
  expect(mockRowsAsked).toEqual([false]);
});

it("a development request may force it on", async () => {
  mockKnob = { on: false, budget_ms: 2500 };
  expect((await read({ forceOn: true })).gate.on).toBe(true);
  expect(mockRowsAsked).toEqual([true]);
});

it("a gate slower than the default budget is off", async () => {
  jest.useFakeTimers();
  try {
    mockHang = true;
    const { readTablePage } = await import("../tablePageSeed.server");
    const reads = readTablePage(TABLE);
    await jest.advanceTimersByTimeAsync(2600);
    await expect(reads.gate).resolves.toEqual({ on: false, budgetMs: 2500 });
  } finally {
    jest.useRealTimers();
  }
});

export {};
