/**
 * A HAND-SET ORDER IS THE SHEET'S SORT (lane ORDER-FIX, 2026-09-25; VERIFIER-19 finding 2).
 *
 * THE USE CASE: admin's Rooms table for a Birchwood Avenue renovation — Kitchen, Backyard Deck,
 * Primary Bath, Garage, Laundry Room, Guest Bedroom. The table's saved sort is Room A→Z. The site
 * lead drags Kitchen to the top because it is the job that starts Monday. On production the store
 * kept that order (`view_record_order_set` answered 200) and the Sheet kept drawing A→Z: after the
 * save, after a reload and on the "Hand-set order" tab, and nothing said why. Pressing Reorder had
 * already created a "Hand-set order" view laid out as the grid before anything was saved.
 *
 * The rule (Airtable's): a manual order is one of a view's sorts. When the view has a hand-set order
 * that order IS the sort — the table's saved sort is not handed on over it; saving a column sort
 * replaces it (the store flips the view to sorted); saving an order lands on the Sheet's own view
 * and only a table with no view at all gets a new one, which opens as the Sheet.
 *
 * Driven through the real `getTableMetadata` / `getTablePage` / `setRowOrdering` / `setDefaultSort`
 * (record-store.ts) and the real `recordsDataSource` seam, against a fake PostgREST.
 */

export {};

const TABLE = "8c62d552-a893-4338-ac05-a266b2178712";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const SHEET_VIEW = "3fd21f8b-d705-4cdd-9052-601c19b882e7";
const HAND_VIEW = "dc21da1a-3762-4f76-86c7-45638026bc43";

const FIELDS = [
  { id: "5e0c1a2b-1111-4a00-8000-000000000001", key: "room_name", label: "Room", type: "text", sort: 1, organization_id: ORG },
  { id: "5e0c1a2b-1111-4a00-8000-000000000002", key: "status", label: "Status", type: "text", sort: 2, organization_id: ORG },
];
const ROOM = (id: string, room_name: string, status: string) => ({ id, document: { room_name, status } });
const KITCHEN = "a1a1a1a1-0000-4000-8000-000000000001";
const DECK = "a1a1a1a1-0000-4000-8000-000000000002";
const BATH = "a1a1a1a1-0000-4000-8000-000000000003";
const GARAGE = "a1a1a1a1-0000-4000-8000-000000000004";
const ROWS = [
  ROOM(DECK, "Backyard Deck", "Planning"),
  ROOM(GARAGE, "Garage", "Quoting"),
  ROOM(BATH, "Primary Bath", "In Progress"),
  ROOM(KITCHEN, "Kitchen", "Quoting"),
];
/** The store's answer for the hand-ordered view: Kitchen first, then the rest as she left them. */
const HAND_ORDER = [KITCHEN, DECK, BATH, GARAGE];

type View = { view_id: string; created_at: string; definition: Record<string, unknown> };
const store: { views: View[]; calls: Array<{ fn: string; args: Record<string, unknown> }> } = { views: [], calls: [] };

const ORDER_KEY_ROW = { path: "order", shape: "server", layouts: ["grid", "sheet"], writer: "server", sentence: "G13." };

function postgrest(fn: string, args: Record<string, unknown>) {
  store.calls.push({ fn, args });
  if (fn === "view_keys") return { data: [ORDER_KEY_ROW], error: null };
  if (fn === "read_records_in_view_order") {
    const offset = Number(args.p_offset ?? 0);
    return { data: offset === 0 ? HAND_ORDER.map((id, i) => ({ id, position: (i + 1) * 1024 })) : [], error: null };
  }
  if (fn === "read_records_page") {
    // The store's page door: a hand-ordered view's positions are the order when no column sort
    // is asked; otherwise the read door's own order.
    const byId = new Map(ROWS.map((r) => [r.id, r]));
    const ordered = args.p_view_id === HAND_VIEW ? HAND_ORDER.map((id) => byId.get(id)!) : ROWS;
    return { data: { total: ROWS.length, limit: args.p_limit, offset: args.p_offset, rows: ordered.map((r) => ({ ...r, level: "owner" })) }, error: null };
  }
  if (fn === "view_record_order_set") {
    return { data: { order: "manual", positioned: (args.p_record_ids as string[]).length, replaced_sorts: [] }, error: null };
  }
  return { data: null, error: { code: "PGRST202", message: `Could not find the function custom.${fn}`, details: null, hint: null } };
}

const fakeSupabase = {
  schema: (_name: string) => ({
    rpc: async (fn: string, args: Record<string, unknown>) => postgrest(fn, args ?? {}),
    from: () => {
      throw new Error("the Sheet touched a table directly");
    },
  }),
  rpc: async (fn: string, args: Record<string, unknown>) => postgrest(fn, args ?? {}),
};

const ok = <T,>(data: T) => ({ ok: true as const, data });
const tableDoc = {
  name: "Rooms",
  // `row_order` says "sorted" on purpose: the Table's word is not the representation (786 tables
  // on production say "manual" beside a saved sort); the view's order is.
  row_order: "sorted",
  default_sort: [{ field: "room_name", direction: "asc" }],
};
const client = {
  recordRead: jest.fn(async () => ok({ document: tableDoc })),
  fields: jest.fn(async () => ok(FIELDS)),
  myLevels: jest.fn(async () => ok([{ id: TABLE, level: "owner" }])),
  fieldOptions: jest.fn(async () => ok([])),
  tableCapacity: jest.fn(async () => ok({ records: ROWS.length })),
  listPage: jest.fn(async (a: { view_id?: string | null; limit: number; offset: number }) => {
    const r = postgrest("read_records_page", { p_view_id: a.view_id ?? null, p_limit: a.limit, p_offset: a.offset });
    const d = r.data as { total: number; rows: Array<{ id: string; document: Record<string, unknown>; level: string }> };
    return ok({ total: d.total, limit: a.limit, offset: a.offset, rows: d.rows.map((x) => ({ ...x, hidden: {} })) });
  }),
  tableDecorations: jest.fn(async () => ok({ rules: [] })),
  rowActions: jest.fn(async () => ok({ actions: [] })),
  views: jest.fn(async () => ok(store.views)),
  viewDeclare: jest.fn(async (_args: unknown) => ok("7d2e0b3c-9999-4b00-8000-0000000000ff")),
  recordUpdate: jest.fn(async (_args: unknown) => ok(2)),
};

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => fakeSupabase }));

const HOME = { store: "record" as const, organizationId: ORG, userId: "87a6e699-3622-4869-8843-d0867456c0dd" };

beforeEach(() => {
  jest.resetModules();
  store.views = [];
  store.calls = [];
  client.viewDeclare.mockClear();
  client.recordUpdate.mockClear();
});

const handView: View = { view_id: HAND_VIEW, created_at: "2026-09-25T03:25:25Z", definition: { order: "manual", layout: "sheet" } };
const sheetDefault: View = { view_id: SHEET_VIEW, created_at: "2026-09-25T00:24:47Z", definition: { layout: "sheet", is_default: true } };

describe("Rooms · a hand-set order is the Sheet's sort", () => {
  it("the table's saved sort is not handed on over the hand-set order, and a page reads in that order", async () => {
    store.views = [handView];
    const rs = await import("../record-store");
    const meta = await rs.getTableMetadata(HOME, { tableId: TABLE });
    if (!meta.success) throw new Error(meta.error);
    const ordering = (meta.data.table as { row_ordering_config?: Record<string, unknown> }).row_ordering_config;
    expect(ordering).toEqual({ enabled: true, order: HAND_ORDER });
    const page = await rs.getTablePage(HOME, { tableId: TABLE, limit: 50, offset: 0 });
    if (!page.success) throw new Error(page.error);
    expect(page.data.rows.map((r) => r.id)).toEqual(HAND_ORDER);
  });

  it("with no hand-set order the saved sort is still the Sheet's sort", async () => {
    store.views = [sheetDefault];
    const rs = await import("../record-store");
    const meta = await rs.getTableMetadata(HOME, { tableId: TABLE });
    if (!meta.success) throw new Error(meta.error);
    expect((meta.data.table as { row_ordering_config?: unknown }).row_ordering_config).toEqual({
      default_sort: { field: "room_name", direction: "asc" },
    });
  });

  it("saving an order lands on the Sheet's own view — nothing new is declared", async () => {
    store.views = [sheetDefault];
    const rs = await import("../record-store");
    const saved = await rs.setRowOrdering(HOME, { tableId: TABLE, enabled: true, order: HAND_ORDER });
    expect(saved.success).toBe(true);
    expect(client.viewDeclare).not.toHaveBeenCalled();
    const set = store.calls.find((c) => c.fn === "view_record_order_set");
    expect(set?.args.p_view_id).toBe(SHEET_VIEW);
    expect(set?.args.p_record_ids).toEqual(HAND_ORDER);
  });

  it("after a sort replaced the order, saving an order again lands on that same view", async () => {
    store.views = [sheetDefault, { ...handView, definition: { order: "sorted", layout: "sheet", sorts: [{ field: "status", direction: "desc" }] } }];
    const rs = await import("../record-store");
    const saved = await rs.setRowOrdering(HOME, { tableId: TABLE, enabled: true, order: [BATH] });
    expect(saved.success).toBe(true);
    expect(client.viewDeclare).not.toHaveBeenCalled();
    expect(store.calls.find((c) => c.fn === "view_record_order_set")?.args.p_view_id).toBe(HAND_VIEW);
  });

  it("a table with no view at all gets one on Save, and it opens as the Sheet", async () => {
    store.views = [];
    const rs = await import("../record-store");
    const saved = await rs.setRowOrdering(HOME, { tableId: TABLE, enabled: true, order: HAND_ORDER });
    expect(saved.success).toBe(true);
    expect(client.viewDeclare).toHaveBeenCalledTimes(1);
    const spec = (client.viewDeclare.mock.calls[0]![0] as { spec: { definition: Record<string, unknown> } }).spec;
    expect(spec.definition.layout).toBe("sheet");
  });

  it("saving a column sort replaces the hand-set order on its view", async () => {
    store.views = [handView];
    const rs = await import("../record-store");
    const saved = await rs.setDefaultSort(HOME, { tableId: TABLE, sortField: "status", sortDirection: "desc" });
    expect(saved.success).toBe(true);
    expect(client.viewDeclare).toHaveBeenCalledWith({
      table_id: TABLE,
      spec: { view_id: HAND_VIEW, definition: { sorts: [{ field: "status", direction: "desc" }] } },
    });
  });
});
