/**
 * THE SEAM'S ONE PROMISE: every table-scoped export of `service.ts` reaches the record store and
 * nothing else.
 *
 * Drives every export twice: with the table already placed (no question asked at all), and
 * unplaced (the one question is the store's own `custom.where_id_opens`, which names the table's
 * organization). Neither may touch a public `supabase.rpc` or a direct `.from` read, and each must
 * land in `data-source/record-store.ts`.
 */
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const rpc = jest.fn(async () => ({ data: null, error: { message: "a public door was called" } }));
const from = jest.fn(() => {
  throw new Error("a table was read directly");
});
const storeRpc = jest.fn(async (fn: string) =>
  fn === "where_id_opens"
    ? { data: { kind: "table", organization_id: ORG, path: "/data/t", live: true }, error: null }
    : { data: null, error: { message: `unexpected store door ${fn}` } },
);
const schema = jest.fn(() => ({ rpc: storeRpc, from }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc, from, schema, auth: { getSession: async () => ({ data: { session: null } }) } },
  createClient: () => ({ rpc, from, schema, auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

const ok = { success: true, data: {} };
const storeCalls: string[] = [];
jest.mock("../record-store", () => {
  const fns = new Map<string, jest.Mock>();
  return new Proxy(
    {},
    {
      get: (_t, key) => {
        const name = String(key);
        if (!fns.has(name)) fns.set(name, jest.fn(async () => (storeCalls.push(name), ok)));
        return fns.get(name);
      },
    },
  );
});

import * as service from "../../service";
import { forgetAllTablePlacements, placeTableInRecordStore } from "../table-home";

const TABLE = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const FIELD = { id: "378f4c49-a8aa-4adf-8ac2-a6c7730a025c", field_name: "work_order", display_name: "Work order", metadata: {} };

/** Every table-scoped export, with arguments a real caller sends. */
const CALLS: Array<[string, () => Promise<unknown>]> = [
  ["getTableMetadata", () => service.getTableMetadata({ tableId: TABLE })],
  ["getTablePage", () => service.getTablePage({ tableId: TABLE, limit: 20, offset: 0 })],
  ["getCompleteTable", () => service.getCompleteTable({ tableId: TABLE })],
  ["upsertRow", () => service.upsertRow({ tableId: TABLE, data: { work_order: "WO-4476" } })],
  ["upsertCell", () => service.upsertCell({ tableId: TABLE, rowId: "r", fieldName: "stage", value: "On site" })],
  ["bulkWrite", () => service.bulkWrite({ tableId: TABLE, operations: [{ op: "cell", row_id: "r", field_name: "stage", value: "x" }] })],
  ["changeFieldType", () => service.changeFieldType({ tableId: TABLE, fieldId: FIELD.id, newType: "number" })],
  ["deleteField", () => service.deleteField({ tableId: TABLE, fieldId: FIELD.id })],
  ["setFieldFormat", () => service.setFieldFormat({ tableId: TABLE, fieldId: FIELD.id, format: { id: "long_text" } })],
  ["backfillAutonumber", () => service.backfillAutonumber({ tableId: TABLE, fieldId: FIELD.id })],
  ["renameColumn", () => service.renameColumn({ tableId: TABLE, field: FIELD, newName: "Job number", fields: [FIELD] })],
  ["setTableStyle", () => service.setTableStyle({ tableId: TABLE, path: ["rows", "r"], value: "amber" })],
  ["renumberFields", () => service.renumberFields({ tableId: TABLE, updates: [{ id: FIELD.id, field_order: 2 }] })],
  ["updateTableMetadata", () => service.updateTableMetadata({ tableId: TABLE, description: "Calls by day." })],
  ["getColumnFacets", () => service.getColumnFacets({ tableId: TABLE, fieldName: "stage" })],
  ["getTableProfile", () => service.getTableProfile({ tableId: TABLE })],
  ["setTableRowLabel", () => service.setTableRowLabel({ tableId: TABLE, rowLabel: { kind: "field", field: "stage" } })],
  ["setTableRowActions", () => service.setTableRowActions({ tableId: TABLE, rowActions: [] })],
  ["hasEditorAccess", () => service.hasEditorAccess({ tableId: TABLE })],
  ["setRowOrdering", () => service.setRowOrdering({ tableId: TABLE, enabled: true, order: ["r"] })],
  ["setDefaultSort", () => service.setDefaultSort({ tableId: TABLE, sortField: "stage", sortDirection: "asc" })],
  ["deleteRow", () => service.deleteRow({ tableId: TABLE, rowId: "r" })],
  ["updateTableConfig", () => service.updateTableConfig({ tableId: TABLE, fieldUpdates: [{ id: FIELD.id, is_required: true }] })],
  ["addTableColumn", () => service.addTableColumn({ tableId: TABLE, fieldName: "minutes", displayName: "Minutes", dataType: "number", isRequired: false })],
  ["readTableDetails", () => service.readTableDetails(TABLE)],
  ["addTableRow", () => service.addTableRow({ tableId: TABLE, data: { work_order: "WO-4476" } })],
];

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
  schema.mockClear();
  storeRpc.mockClear();
  storeCalls.length = 0;
  forgetAllTablePlacements();
});

describe("a placed table", () => {
  it.each(CALLS)("%s reaches the record store and no other door", async (_name, call) => {
    placeTableInRecordStore(TABLE, { organizationId: ORG, userId: "87a6e699" });
    await call().catch(() => undefined);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(storeRpc).not.toHaveBeenCalled();
    expect(storeCalls.length).toBeGreaterThan(0);
  });
});

describe("a table nobody placed", () => {
  it.each(CALLS)("%s asks the store where the table opens, then reaches the record store", async (_name, call) => {
    await call().catch(() => undefined);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(storeRpc.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["where_id_opens"]);
    expect(storeCalls.length).toBeGreaterThan(0);
  });
});
