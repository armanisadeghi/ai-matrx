/**
 * A PAGE IS ONE CALL, AN EDIT IS ONE CALL, A BATCH IS ONE TRANSACTION (lane data-tables-grid-overhaul,
 * DOOR-SPEED, 2026-09-25).
 *
 * THE USE CASE: a dispatcher at a Camarillo service company works "September service board"
 * (1,000 jobs) in the Sheet. Measured on the preview before this (v2 readiness audit): every
 * search, sort and page turn read the WHOLE table in sequential 200-row pages (2.5–3.0 s), a cell
 * edit re-read the whole table before it wrote (3.0 s), and a 20-row fill was 20 separate calls
 * that could half-apply. The store's own doors now carry it:
 *   · a page — sorted, searched, counted — is ONE `custom.read_records_page` call, and the table's
 *     metadata is read once, not per page;
 *   · a cell edit is ONE `record_update`, with nothing read before or after it;
 *   · a fill of twenty rows is ONE `custom.record_change_many` call; when the store refuses one of
 *     them the batch is refused and the Sheet reports the store's sentence, never a half.
 *
 * Driven through the real `record-store.ts` and the real `recordsDataSource` seam against a fake
 * PostgREST that behaves as the store does — the batch applies all of its changes or none.
 */

export {};

const TABLE = "3260bbbe-aaa8-4148-a4d9-7ad880e7976d";
const ORG = "57f2a22b-5875-46c6-80df-437076421c28";
const HOME = { store: "record" as const, organizationId: ORG, userId: "87a6e699-3622-4869-8843-d0867456c0dd" };
const SEAM = process.env.SEAM_UNDER_TEST ?? "../record-store";

const FIELDS = [
  { id: "aae18f00-e054-45c4-b3cf-b5d19a236b7c", key: "customer", label: "Customer", type: "text", sort: 1, organization_id: ORG },
  { id: "8053521f-3ecc-4a8e-ab02-e2c7e71b166a", key: "job_number", label: "Job Number", type: "text", sort: 2, organization_id: ORG },
  { id: "76543eb4-f5cf-4e6b-880b-4b3cc66b8d29", key: "scheduled_date", label: "Scheduled Date", type: "range", config: { kind: "date" }, sort: 3, organization_id: ORG },
  { id: "56e848b0-4805-4f60-ae13-fc3013e2b429", key: "notes", label: "Notes", type: "text", sort: 4, organization_id: ORG },
];
const CUSTOMERS = ["Samir Gallardo", "Nadia Lindqvist", "Elena Ibarra", "Priya Natarajan", "Ana Alcantar"];
const JOBS = Array.from({ length: 1000 }, (_, i) => ({
  id: `0000${String(i).padStart(4, "0")}-0000-4000-8000-000000000000`,
  document: {
    customer: CUSTOMERS[i % CUSTOMERS.length],
    job_number: `RPC-SEP-${41000 + i}`,
    scheduled_date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
    notes: "Tenant works nights, do not arrive before 11am.",
  },
}));

type Call = { fn: string; args: Record<string, unknown> };
const store = { calls: [] as Call[], data: new Map<string, Record<string, unknown>>() };

function postgrest(fn: string, args: Record<string, unknown>) {
  store.calls.push({ fn, args });
  if (fn === "view_keys") return { data: [{ path: "order", writer: "server" }], error: null };
  if (fn === "read_records_page") {
    const term = typeof args.p_search === "string" ? args.p_search.toLowerCase() : null;
    let rows = JOBS.map((j) => ({ id: j.id, document: store.data.get(j.id)! }));
    if (term) rows = rows.filter((r) => JSON.stringify(r.document).toLowerCase().includes(term));
    const sort = (args.p_sort as Array<{ field: string; direction: string }>)[0];
    if (sort) {
      rows = [...rows].sort((a, b) => {
        const cmp = String(a.document[sort.field]).localeCompare(String(b.document[sort.field])) || a.id.localeCompare(b.id);
        return sort.direction === "desc" ? -cmp : cmp;
      });
    }
    const offset = Number(args.p_offset);
    const limit = Number(args.p_limit);
    return {
      data: { total: rows.length, limit, offset, rows: rows.slice(offset, offset + limit).map((r) => ({ ...r, level: "admin" })) },
      error: null,
    };
  }
  if (fn === "record_change_many") {
    // ONE TRANSACTION, as the store runs it: every change is judged first; one refusal refuses all.
    const changes = args.p_changes as Array<{ op: string; record_id: string; patch: Record<string, unknown> }>;
    const bad = changes.findIndex((c) => c.op === "update" && c.patch.status === "Totally Made Up");
    if (bad >= 0) {
      return {
        data: null,
        error: {
          code: "23514",
          message: 'Status does not have a choice called "Totally Made Up".',
          hint: `Nothing in this batch of ${changes.length} changes was saved: change ${bad + 1} was refused, and the batch is one transaction.`,
          details: "",
        },
      };
    }
    for (const c of changes) {
      const { _op_id: _opId, ...patch } = c.patch;
      store.data.set(c.record_id, { ...store.data.get(c.record_id)!, ...patch });
    }
    return { data: changes.map((c) => ({ op: "update", id: c.record_id, version: 2 })), error: null };
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
const client = {
  recordRead: jest.fn(async () => ok({ document: { name: "September service board — Camarillo" } })),
  fields: jest.fn(async () => ok(FIELDS)),
  myLevels: jest.fn(async () => ok([{ id: TABLE, level: "admin" }])),
  tableCapacity: jest.fn(async () => ok({ records: JOBS.length })),
  fieldOptions: jest.fn(async () => ok([])),
  // The whole-table read the Sheet used to page through (kept so the old seam can be run RED).
  list: jest.fn(async ({ offset = 0, limit = 50 }: { offset?: number; limit?: number }) =>
    ok({ rows: JOBS.slice(offset, offset + limit).map((j) => ({ ...j, document: store.data.get(j.id)! })), total: null }),
  ),
  tableDecorations: jest.fn(async () => ok({ rules: [] })),
  rowActions: jest.fn(async () => ok({ actions: [] })),
  views: jest.fn(async () => ok([])),
  recordUpdate: jest.fn(async () => ok(2)),
};

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => fakeSupabase }));

type Seam = typeof import("../record-store");

beforeEach(() => {
  jest.resetModules();
  store.calls = [];
  store.data = new Map(JOBS.map((j) => [j.id, { ...j.document }]));
  for (const fn of Object.values(client)) fn.mockClear();
});

const doorCalls = () => store.calls.filter((c) => c.fn !== "view_keys");
const clientReads = () => client.recordRead.mock.calls.length + client.list.mock.calls.length;

describe("September service board · the Sheet asks the store one question per action", () => {
  it("search finds a job on page 6 with ONE page call, counted by the store; the metadata is read once", async () => {
    const rs: Seam = await import(SEAM);
    const meta = await rs.getTableMetadata(HOME, { tableId: TABLE });
    if (!meta.success) throw new Error(meta.error);
    expect(meta.data.row_count).toBe(1000);
    store.calls = [];
    const readsAfterLoad = clientReads();

    const found = await rs.getTablePage(HOME, { tableId: TABLE, limit: 20, offset: 0, searchTerm: "RPC-SEP-41101" });
    if (!found.success) throw new Error(found.error);
    expect(found.data.rows.map((r) => r.data.job_number)).toEqual(["RPC-SEP-41101"]);
    expect(found.data.pagination.total_count).toBe(1);

    const sorted = await rs.getTablePage(HOME, { tableId: TABLE, limit: 20, offset: 100, sortField: "customer", sortDirection: "asc" });
    if (!sorted.success) throw new Error(sorted.error);
    expect(sorted.data.pagination).toEqual({ total_count: 1000, page_count: 50, current_page: 6 });

    expect(doorCalls().map((c) => c.fn)).toEqual(["read_records_page", "read_records_page"]);
    expect(store.calls[0]!.args).toMatchObject({ p_search: "RPC-SEP-41101", p_sort: [], p_limit: 20, p_offset: 0 });
    expect(store.calls[1]!.args).toMatchObject({ p_sort: [{ field: "customer", direction: "asc", as: "text" }], p_offset: 100 });
    // Nothing re-read the table: no declaration read, no whole-table list.
    expect(clientReads()).toBe(readsAfterLoad);
  });

  it("a caller asking for 10,000 rows is served store page by store page — every row, no ceiling", async () => {
    const rs: Seam = await import(SEAM);
    await rs.getTableMetadata(HOME, { tableId: TABLE });
    store.calls = [];
    const all = await rs.getTablePage(HOME, { tableId: TABLE, limit: 10_000, offset: 0 });
    if (!all.success) throw new Error(all.error);
    expect(all.data.rows).toHaveLength(1000);
    expect(new Set(all.data.rows.map((r) => r.id)).size).toBe(1000);
    expect(doorCalls().every((c) => c.fn === "read_records_page" && Number(c.args.p_limit) <= 1000)).toBe(true);
  });

  it("a date column sorts as a date; a column the grid names by its header sorts by its key", async () => {
    const rs: Seam = await import(SEAM);
    await rs.getTableMetadata(HOME, { tableId: TABLE });
    store.calls = [];
    const page = await rs.getTablePage(HOME, { tableId: TABLE, limit: 20, offset: 0, sortField: "Scheduled Date", sortDirection: "desc" });
    if (!page.success) throw new Error(page.error);
    expect(doorCalls()[0]!.args.p_sort).toEqual([{ field: "scheduled_date", direction: "desc", as: "date" }]);
  });

  it("a cell edit is ONE write — nothing is read before it or after it", async () => {
    const rs: Seam = await import(SEAM);
    await rs.getTableMetadata(HOME, { tableId: TABLE });
    store.calls = [];
    const readsBefore = clientReads();
    const saved = await rs.upsertCell(HOME, { tableId: TABLE, rowId: JOBS[42]!.id, fieldName: "customer", value: "Nadia Lindqvist" });
    expect(saved.success).toBe(true);
    expect(client.recordUpdate).toHaveBeenCalledTimes(1);
    expect(client.recordUpdate).toHaveBeenCalledWith({ record_id: JOBS[42]!.id, patch: { customer: "Nadia Lindqvist" } });
    // The next page does not re-read the table's declaration either: the edit did not change it.
    await rs.getTablePage(HOME, { tableId: TABLE, limit: 20, offset: 0 });
    expect(clientReads()).toBe(readsBefore);
    expect(doorCalls().map((c) => c.fn)).toEqual(["read_records_page"]);
  });

  it("filling twenty rows is ONE call to the store's many-changes door", async () => {
    const rs: Seam = await import(SEAM);
    await rs.getTableMetadata(HOME, { tableId: TABLE });
    store.calls = [];
    const twenty = JOBS.slice(0, 20);
    const done = await rs.bulkWrite(HOME, {
      tableId: TABLE,
      operations: twenty.map((j) => ({ op: "cell" as const, row_id: j.id, field_name: "notes", value: "Gate code 4471, call on arrival" })),
    });
    if (!done.success) throw new Error(done.error);
    expect(done.data.count).toBe(20);
    expect(doorCalls().map((c) => c.fn)).toEqual(["record_change_many"]);
    expect(client.recordUpdate).not.toHaveBeenCalled();
    const sent = doorCalls()[0]!.args.p_changes as Array<{ patch: Record<string, unknown> }>;
    expect(new Set(sent.map((c) => c.patch._op_id)).size).toBe(1);
    for (const j of twenty) expect(store.data.get(j.id)!.notes).toBe("Gate code 4471, call on arrival");
  });

  it("when the store refuses one row of the batch, NO row changes and the store's sentence comes back", async () => {
    const rs: Seam = await import(SEAM);
    await rs.getTableMetadata(HOME, { tableId: TABLE });
    const five = JOBS.slice(20, 25);
    const before = five.map((j) => ({ ...store.data.get(j.id)! }));
    const done = await rs.bulkWrite(HOME, {
      tableId: TABLE,
      operations: five.map((j, i) => ({
        op: "cell" as const,
        row_id: j.id,
        field_name: i === 2 ? "status" : "notes",
        value: i === 2 ? "Totally Made Up" : "Customer asked for a morning slot",
      })),
    });
    expect(done.success).toBe(false);
    if (done.success) return;
    expect(done.error).toContain("Totally Made Up");
    expect(done.refusal?.hint).toContain("Nothing in this batch of 5 changes was saved");
    expect(client.recordUpdate).not.toHaveBeenCalled();
    expect(five.map((j) => store.data.get(j.id))).toEqual(before);
  });
});
