/**
 * OPENING A TABLE IN THE SHEET PUTS NO ERROR IN THE CONSOLE (lane FE-TAILS, 2026-09-24).
 *
 * THE USE CASE: Rincon Plumbing's Service Calls table, designated to open as the Sheet. The
 * owner opened it and the admin debug badge read "2 errors". Both were ONE designed failure:
 * GRID-PORT asked the store for the rows of a view id that cannot exist (the all-zero uuid) to
 * learn whether hand-set row orders were kept here. A store that has the door answers that
 * 23503, which PostgREST returns as HTTP 409 — so every table's first open logged a 409.
 *
 * The Sheet's mount reads the table through `getTableMetadata` (record-store.ts). This drives
 * that read against a store that behaves the way the live one does — the typed client's doors
 * answer, and the grid doors called by name go through the REAL `recordsDataSource` seam to a
 * fake PostgREST that refuses exactly what the live database refuses (a view that is not there
 * is 23503/409) — and fails on ANY error answer the browser would log, or any console.error.
 */

// A module, so its constants never collide with another test file's under tsc.
export {};

const TABLE = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const STATUS = "7d2e0b3c-2222-4b00-8000-000000000001";
const CUSTOMER = "7d2e0b3c-2222-4b00-8000-000000000002";
const HAND_VIEW = "7d2e0b3c-2222-4b00-8000-0000000000aa";

const FIELDS = [
  { id: CUSTOMER, key: "customer", label: "Customer", type: "text", sort: 1, organization_id: ORG },
  { id: STATUS, key: "status", label: "Status", type: "text", sort: 2, organization_id: ORG },
];
const ROWS = [
  { id: "c-1", document: { customer: "Marisol Ortega — water heater", status: "Scheduled" } },
  { id: "c-2", document: { customer: "Harbor View Dental — slab leak", status: "On site" } },
];

/** The live registry's `order` row, as `custom.view_keys()` answers it. */
const ORDER_KEY_ROW = {
  path: "order",
  shape: "server",
  layouts: ["grid", "sheet"],
  writer: "server",
  sentence: "G13's hand-set order, written only by custom.view_record_order_set.",
};
const LAYOUT_KEY_ROW = { path: "layout", shape: "kind", layouts: ["grid", "sheet"], writer: "caller", sentence: "Which way to look." };

type StoreState = { views: Array<{ view_id: string; created_at: string; definition: Record<string, unknown> }>; registry: unknown[] };
const store: StoreState = { views: [], registry: [LAYOUT_KEY_ROW, ORDER_KEY_ROW] };
/** Every answer the browser's network panel would show in red. */
const networkErrors: string[] = [];

function postgrest(fn: string, args: Record<string, unknown>) {
  if (fn === "view_keys") return { data: store.registry, error: null };
  if (fn === "read_records_in_view_order") {
    if (!store.views.some((v) => v.view_id === args.p_view_id)) {
      networkErrors.push(`409 custom.${fn}(${String(args.p_view_id)})`);
      return {
        data: null,
        error: { code: "23503", message: "The view is not there.", details: null, hint: null },
      };
    }
    return { data: [{ id: "c-2", position: 1 }, { id: "c-1", position: 2 }], error: null };
  }
  networkErrors.push(`404 custom.${fn}`);
  return { data: null, error: { code: "PGRST202", message: `Could not find the function custom.${fn}`, details: null, hint: null } };
}

const fakeSupabase = {
  schema: (_name: string) => ({
    rpc: async (fn: string, args: Record<string, unknown>) => postgrest(fn, args ?? {}),
    from: () => {
      throw new Error("the Sheet's read touched a table directly");
    },
  }),
  rpc: async (fn: string, args: Record<string, unknown>) => postgrest(fn, args ?? {}),
};

const ok = <T,>(data: T) => ({ ok: true as const, data });
const client = {
  recordRead: jest.fn(async () => ok({ document: { name: "Service Calls", row_order: "sorted" } })),
  fields: jest.fn(async () => ok(FIELDS)),
  myLevels: jest.fn(async () => ok([{ id: TABLE, level: "owner" }])),
  fieldOptions: jest.fn(async () => ok([])),
  tableCapacity: jest.fn(async () => ok({ records: ROWS.length })),
  tableDecorations: jest.fn(async () => ok({ rules: [] })),
  rowActions: jest.fn(async () => ok({ actions: [] })),
  views: jest.fn(async () => ok(store.views)),
};

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => fakeSupabase }));

const HOME = { store: "record" as const, organizationId: ORG, userId: "87a6e699-0000-4000-8000-000000000009" };

let consoleErrors: unknown[][] = [];
let restore: () => void = () => {};

beforeEach(() => {
  jest.resetModules();
  networkErrors.length = 0;
  consoleErrors = [];
  store.views = [];
  store.registry = [LAYOUT_KEY_ROW, ORDER_KEY_ROW];
  const spy = jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args);
  });
  restore = () => spy.mockRestore();
});
afterEach(() => restore());

async function openInTheSheet() {
  const { getTableMetadata } = await import("../record-store");
  const read = await getTableMetadata(HOME, { tableId: TABLE });
  if (!read.success) throw new Error(read.error);
  return read.data.table as { metadata: { record_store?: { hand_order?: string } }; row_ordering_config?: unknown };
}

describe("Rincon Service Calls · opening a table in the Sheet logs no error", () => {
  it("a table with no hand-set order yet: no error answer, and hand-set order is offered", async () => {
    const table = await openInTheSheet();
    expect(networkErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(table.metadata.record_store?.hand_order).toBe("served");
  });

  it("a table a person already put in order: its view is read, still no error answer", async () => {
    store.views = [{ view_id: HAND_VIEW, created_at: "2026-09-20T17:00:00Z", definition: { order: "manual" } }];
    const table = await openInTheSheet();
    expect(networkErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(table.metadata.record_store?.hand_order).toBe("served");
  });

  it("a store whose registry has no order key: the capability is absent with a sentence, and no error answer", async () => {
    store.registry = [LAYOUT_KEY_ROW];
    const table = await openInTheSheet();
    expect(networkErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(table.metadata.record_store?.hand_order).toMatch(/does not keep a hand-set row order/);
  });
});
