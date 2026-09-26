/**
 * THE SEAM'S ONE PROMISE: a table the record store holds never reaches an older door.
 *
 * A moved table's older copy is ARCHIVED, not deleted, and the older doors still
 * answer for it — so a seam export that forgot to ask `table-home.ts` would read
 * yesterday's copy, or worse, WRITE to it and report success over a table nobody
 * is looking at. This drives every table-scoped export of `service.ts` with a
 * placed table and fails if any of them touches `supabase.rpc` / `.from` (the
 * older store's only ways in); and drives the same exports with an unplaced
 * table to prove the older half still runs its own door, unchanged.
 */
const rpc = jest.fn(async () => ({ data: { success: true, tables: [], data: [], pagination: {} }, error: null }));
const from = jest.fn(() => {
  throw new Error("an older table was read directly");
});
const schema = jest.fn(() => ({ rpc, from }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc, from, schema },
  createClient: () => ({ rpc, from, schema }),
}));

const ok = { success: true, data: {} };
jest.mock("../record-store", () => {
  const handler = { get: () => jest.fn(async () => ok) };
  return new Proxy({}, handler);
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
  ["setValidationMode", () => service.setValidationMode({ tableId: TABLE, mode: "strict" })],
  ["getColumnFacets", () => service.getColumnFacets({ tableId: TABLE, fieldName: "stage" })],
  ["getTableProfile", () => service.getTableProfile({ tableId: TABLE })],
  ["setTableRowLabel", () => service.setTableRowLabel({ tableId: TABLE, rowLabel: { kind: "field", field: "stage" } })],
  ["setTableRowActions", () => service.setTableRowActions({ tableId: TABLE, rowActions: [] })],
  ["hasEditorAccess", () => service.hasEditorAccess({ tableId: TABLE })],
  ["setRowOrdering", () => service.setRowOrdering({ tableId: TABLE, enabled: true, order: ["r"] })],
  ["setDefaultSort", () => service.setDefaultSort({ tableId: TABLE, sortField: "stage", sortDirection: "asc" })],
  ["deleteRow", () => service.deleteRow({ tableId: TABLE, rowId: "r" })],
  ["getRowsForClientSort", () => service.getRowsForClientSort({ tableId: TABLE, limit: 100 })],
  ["updateTableConfig", () => service.updateTableConfig({ tableId: TABLE, fieldUpdates: [{ id: FIELD.id, is_required: true }] })],
  ["addTableColumn", () => service.addTableColumn({ tableId: TABLE, fieldName: "minutes", displayName: "Minutes", dataType: "number", isRequired: false })],
  ["readTableDetails", () => service.readTableDetails(TABLE)],
  ["addTableRow", () => service.addTableRow({ tableId: TABLE, data: { work_order: "WO-4476" } })],
];

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
  schema.mockClear();
  forgetAllTablePlacements();
});

describe("a table the record store holds", () => {
  it.each(CALLS)("%s never calls an older door", async (_name, call) => {
    placeTableInRecordStore(TABLE, { organizationId: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f", userId: "87a6e699" });
    await call().catch(() => undefined);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("an older table", () => {
  it.each([
    ["getTableMetadata", "get_full_table"],
    ["getTablePage", "get_user_table_data_paginated_v2"],
    ["upsertCell", "udt_upsert_cell"],
    ["bulkWrite", "udt_bulk_write"],
    ["setTableStyle", "udt_set_table_style"],
    ["hasEditorAccess", "has_access"], // the access kernel (canActOn → iam.has_access), never the direct-share check
    ["setRowOrdering", "update_user_table_row_ordering"],
    ["deleteRow", "delete_data_row_from_user_table"],
    ["updateTableConfig", "update_user_table_config"],
  ])("%s still runs its own older door (%s)", async (name, door) => {
    const call = CALLS.find(([n]) => n === name)![1];
    await call().catch(() => undefined);
    expect(rpc.mock.calls.map((c) => (c as unknown[])[0])).toContain(door);
  });
});
