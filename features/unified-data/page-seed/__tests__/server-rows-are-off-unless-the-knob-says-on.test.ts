// SERVER ROWS ARE OFF UNLESS THE PERSON'S KNOB SAYS ON (lane SSR-ROWS-2).
//
// A table page waits for the server's first reads and draws its rows in the server's HTML only when
// `custom.table_page_server_rows` resolves the knob `data/server_rows` to true for the person in the
// table's organization (a per-person override on the test accounts; default off for everyone). A
// refused or missing gate door, a non-true value, or a gate slower than its budget are all OFF, and an
// off page never asks the grid's first page on the server. The budget comes from the person's knob
// `data/server_rows_budget_ms`. RED before: the knob was one global row read per process — no person,
// no organization, no budget.

jest.mock("server-only", () => ({}), { virtual: true });

type Answer = { data: unknown; error: unknown };
let mockGate: Answer | "hang" = { data: null, error: null };
const mockAsked: string[] = [];
const mockRowsAsked: boolean[] = [];

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    schema: () => ({
      rpc: (fn: string) => {
        mockAsked.push(fn);
        if (fn === "table_page_server_rows") return mockGate === "hang" ? new Promise(() => {}) : Promise.resolve(mockGate);
        if (fn === "where_id_opens") return Promise.resolve({ data: { kind: "table", organization_id: ORG }, error: null });
        return Promise.resolve({ data: null, error: { message: `unexpected ${fn}` } });
      },
    }),
  }),
}));
jest.mock("@/utils/supabase/claimsUser", () => ({ getClaimsUser: async () => ({ data: { user: { id: "87a6e699-3622-4869-8843-d0867456c0dd" } } }) }));
jest.mock("@ai-matrx/records-ui/first-page", () => ({
  askTablePageSeed: async ({ rows }: { rows: boolean }) => {
    mockRowsAsked.push(rows);
    return { at: Date.now(), answers: [] };
  },
}));

const ORG = "344cfaa8-2b0c-4971-854a-9694614816f2";
const TABLE = "7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd";
const where = { kind: "table", organization_id: ORG };

beforeEach(() => {
  mockAsked.length = 0;
  mockRowsAsked.length = 0;
});

async function read(options: { rows?: boolean; forceOn?: boolean } = {}) {
  const { readTablePage } = await import("../tablePageSeed.server");
  const reads = readTablePage(TABLE, null, options);
  return { gate: await reads.gate, seed: await reads.seed };
}

it("the person's knob says on: rows are asked on the server, within the person's budget", async () => {
  mockGate = { data: { where, organization_id: ORG, on: true, budget_ms: 6000 }, error: null };
  const { gate, seed } = await read();
  expect(gate).toEqual({ on: true, budgetMs: 6000 });
  expect(mockRowsAsked).toEqual([true]);
  expect(seed?.organizationId).toBe(ORG);
  expect(mockAsked).toEqual(["table_page_server_rows"]);
});

it("the person's knob says off: no rows asked on the server", async () => {
  mockGate = { data: { where, organization_id: ORG, on: false, budget_ms: 2500 }, error: null };
  const { gate } = await read();
  expect(gate.on).toBe(false);
  expect(mockRowsAsked).toEqual([false]);
});

it("the gate door refuses: off, and the table's address is asked as before", async () => {
  mockGate = { data: null, error: { code: "42501", message: "permission denied" } };
  const { gate, seed } = await read();
  expect(gate).toEqual({ on: false, budgetMs: 2500 });
  expect(mockAsked).toEqual(["table_page_server_rows", "where_id_opens"]);
  expect(seed?.organizationId).toBe(ORG);
  expect(mockRowsAsked).toEqual([false]);
});

it("a value other than true is off", async () => {
  mockGate = { data: { where, organization_id: ORG, on: "true", budget_ms: 2500 }, error: null };
  expect((await read()).gate.on).toBe(false);
});

it("an address that opens elsewhere asks no rows even when on", async () => {
  mockGate = { data: { where, organization_id: ORG, on: true, budget_ms: 2500 }, error: null };
  await read({ rows: false });
  expect(mockRowsAsked).toEqual([false]);
});

it("a development request may force it on", async () => {
  mockGate = { data: { where, organization_id: ORG, on: false, budget_ms: 2500 }, error: null };
  expect((await read({ forceOn: true })).gate.on).toBe(true);
  expect(mockRowsAsked).toEqual([true]);
});

it("a gate slower than the default budget is off", async () => {
  jest.useFakeTimers();
  try {
    mockGate = "hang";
    const { readTablePage } = await import("../tablePageSeed.server");
    const reads = readTablePage(TABLE);
    await jest.advanceTimersByTimeAsync(2600);
    await expect(reads.gate).resolves.toEqual({ on: false, budgetMs: 2500 });
  } finally {
    jest.useRealTimers();
  }
});

export {};
